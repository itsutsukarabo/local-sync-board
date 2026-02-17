/**
 * rpc_transfer_score 仕様テスト
 *
 * 対象: supabase/migrations/006_create_rpc_functions.sql — rpc_transfer_score
 * 概要: プレイヤー間 / プレイヤー⇄供託(Pot) のスコア移動を原子的に行う RPC 関数
 *
 * 前提:
 *   - ローカル Supabase が起動済み (supabase start)
 *   - マイグレーション適用済み (supabase db reset)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createServiceClient,
  createTestUser,
  createTestRoom,
  deleteTestRoom,
  deleteTestUser,
  getRoomState,
  getRoomHistory,
  makePlayerState,
} from "../helpers/supabase";

// ---- テスト共通 ----

let supabase: SupabaseClient;
let hostUserId: string;
let roomId: string;

const PLAYER_A = "player-aaa-1234-5678-abcdefabcdef";
const PLAYER_B = "player-bbb-1234-5678-abcdefabcdef";

beforeEach(async () => {
  supabase = createServiceClient();
  hostUserId = await createTestUser(supabase);
});

afterEach(async () => {
  if (roomId) await deleteTestRoom(supabase, roomId);
  if (hostUserId) await deleteTestUser(supabase, hostUserId);
});

// ---- ヘルパー: RPC 呼び出し ----

async function callTransferScore(params: {
  roomId: string;
  fromId: string;
  toId: string;
  transfers: Array<{ variable: string; amount: number }>;
  fromName?: string;
  toName?: string;
}) {
  const { data, error } = await supabase.rpc("rpc_transfer_score", {
    p_room_id: params.roomId,
    p_from_id: params.fromId,
    p_to_id: params.toId,
    p_transfers: params.transfers,
    p_from_name: params.fromName ?? null,
    p_to_name: params.toName ?? null,
  });
  return { data, error };
}

// ================================================================
// 仕様: rpc_transfer_score
// ================================================================

describe("rpc_transfer_score", () => {
  // ============================================================
  // 正常系: プレイヤー間の送金
  // ============================================================
  describe("正常系: プレイヤー間の送金", () => {
    it("指定した変数と金額が from から減算され to に加算される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      const { data } = await callTransferScore({
        roomId,
        fromId: PLAYER_A,
        toId: PLAYER_B,
        transfers: [{ variable: "score", amount: 8000 }],
        fromName: "Alice",
        toName: "Bob",
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(17000); // 25000 - 8000
      expect(b.score).toBe(33000); // 25000 + 8000
    });

    it("操作履歴 (room_history) が1件作成され、操作前スナップショットが保存される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      await callTransferScore({
        roomId,
        fromId: PLAYER_A,
        toId: PLAYER_B,
        transfers: [{ variable: "score", amount: 1000 }],
        fromName: "Alice",
        toName: "Bob",
      });

      const history = await getRoomHistory(supabase, roomId);
      expect(history).toHaveLength(1);
      expect(history[0].message).toContain("Alice");
      expect(history[0].message).toContain("Bob");
      expect(history[0].message).toContain("点数"); // variable label

      // スナップショットは操作 "前" の状態
      const snapshot = history[0].snapshot as Record<string, unknown>;
      const snapA = snapshot[PLAYER_A] as Record<string, number>;
      expect(snapA.score).toBe(25000);
    });

    it("__recent_log__ にメッセージが追加される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      await callTransferScore({
        roomId,
        fromId: PLAYER_A,
        toId: PLAYER_B,
        transfers: [{ variable: "score", amount: 500 }],
        fromName: "Alice",
        toName: "Bob",
      });

      const state = await getRoomState(supabase, roomId);
      const log = state.__recent_log__ as Array<{
        id: string;
        message: string;
        timestamp: number;
      }>;
      expect(log).toHaveLength(1);
      expect(log[0].message).toContain("Alice → Bob");
    });
  });

  // ============================================================
  // 正常系: プレイヤー → 供託 (Pot)
  // ============================================================
  describe("正常系: プレイヤー → 供託 (Pot)", () => {
    it("プレイヤーから減算され __pot__ に加算される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState(
          [{ id: PLAYER_A, score: 25000 }],
          { score: 0 } // pot 初期値
        ),
      });

      const { data } = await callTransferScore({
        roomId,
        fromId: PLAYER_A,
        toId: "__pot__",
        transfers: [{ variable: "score", amount: 1000 }],
        fromName: "Alice",
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const pot = state.__pot__ as Record<string, number>;
      expect(a.score).toBe(24000);
      expect(pot.score).toBe(1000);
    });

    it("__pot__ が存在しない場合は自動初期化される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 25000 }]),
        // pot なし
      });

      const { data } = await callTransferScore({
        roomId,
        fromId: PLAYER_A,
        toId: "__pot__",
        transfers: [{ variable: "score", amount: 1000 }],
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const pot = state.__pot__ as Record<string, number>;
      expect(pot).toBeDefined();
      expect(pot.score).toBe(1000);
    });
  });

  // ============================================================
  // 正常系: 供託 → プレイヤー
  // ============================================================
  describe("正常系: 供託 (Pot) → プレイヤー", () => {
    it("__pot__ から減算されプレイヤーに加算される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState(
          [{ id: PLAYER_A, score: 25000 }],
          { score: 3000 }
        ),
      });

      const { data } = await callTransferScore({
        roomId,
        fromId: "__pot__",
        toId: PLAYER_A,
        transfers: [{ variable: "score", amount: 3000 }],
        toName: "Alice",
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const pot = state.__pot__ as Record<string, number>;
      expect(a.score).toBe(28000); // 25000 + 3000
      expect(pot.score).toBe(0);
    });
  });

  // ============================================================
  // 正常系: 複数変数の同時送金
  // ============================================================
  describe("正常系: 複数変数の同時送金", () => {
    it("p_transfers 配列の全変数が順に処理される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000, riichi: 2 },
          { id: PLAYER_B, score: 25000, riichi: 0 },
        ]),
      });

      const { data } = await callTransferScore({
        roomId,
        fromId: PLAYER_A,
        toId: PLAYER_B,
        transfers: [
          { variable: "score", amount: 8000 },
          { variable: "riichi", amount: 1 },
        ],
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(17000);
      expect(a.riichi).toBe(1);
      expect(b.score).toBe(33000);
      expect(b.riichi).toBe(1);
    });
  });

  // ============================================================
  // 異常系
  // ============================================================
  describe("異常系", () => {
    it("存在しない room_id → エラー 'ルームが見つかりません'", async () => {
      // ルームを作成せずに存在しない UUID で呼び出す
      const { data } = await callTransferScore({
        roomId: "00000000-0000-0000-0000-000000000000",
        fromId: PLAYER_A,
        toId: PLAYER_B,
        transfers: [{ variable: "score", amount: 1000 }],
      });

      expect(data).toEqual({ error: "ルームが見つかりません" });
    });

    it("存在しない送信元プレイヤー → エラー 'プレイヤーが見つかりません'", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_B, score: 25000 }]),
      });

      const { data } = await callTransferScore({
        roomId,
        fromId: "nonexistent-player",
        toId: PLAYER_B,
        transfers: [{ variable: "score", amount: 1000 }],
      });

      expect(data).toEqual({ error: "プレイヤーが見つかりません" });
    });

    it("存在しない送信先プレイヤー → エラー 'プレイヤーが見つかりません'", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 25000 }]),
      });

      const { data } = await callTransferScore({
        roomId,
        fromId: PLAYER_A,
        toId: "nonexistent-player",
        transfers: [{ variable: "score", amount: 1000 }],
      });

      expect(data).toEqual({ error: "プレイヤーが見つかりません" });
    });

    it("供託金不足 → エラー '供託金が不足しています'", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState(
          [{ id: PLAYER_A, score: 25000 }],
          { score: 500 } // pot に 500 しかない
        ),
      });

      const { data } = await callTransferScore({
        roomId,
        fromId: "__pot__",
        toId: PLAYER_A,
        transfers: [{ variable: "score", amount: 1000 }], // 1000 要求
      });

      expect(data).toEqual({ error: "供託金が不足しています" });
    });
  });
});
