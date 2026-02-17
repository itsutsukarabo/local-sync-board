/**
 * rpc_force_edit_score 仕様テスト
 *
 * 対象: supabase/migrations/006_create_rpc_functions.sql — rpc_force_edit_score
 * 概要: 指定プレイヤーの変数を任意の値に上書きする（管理者向け強制編集）
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

let supabase: SupabaseClient;
let hostUserId: string;
let roomId: string;

const PLAYER_A = "player-aaa-1234-5678-abcdefabcdef";

beforeEach(async () => {
  supabase = createServiceClient();
  hostUserId = await createTestUser(supabase);
});

afterEach(async () => {
  if (roomId) await deleteTestRoom(supabase, roomId);
  if (hostUserId) await deleteTestUser(supabase, hostUserId);
});

async function callForceEditScore(params: {
  roomId: string;
  playerId: string;
  updates: Record<string, number>;
  displayName?: string;
}) {
  const { data, error } = await supabase.rpc("rpc_force_edit_score", {
    p_room_id: params.roomId,
    p_player_id: params.playerId,
    p_updates: params.updates,
    p_display_name: params.displayName ?? null,
  });
  return { data, error };
}

describe("rpc_force_edit_score", () => {
  describe("正常系: 単一変数の上書き", () => {
    it("指定プレイヤーの score が新しい値に上書きされる", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 25000 }]),
      });

      const { data } = await callForceEditScore({
        roomId,
        playerId: PLAYER_A,
        updates: { score: 50000 },
        displayName: "Alice",
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      expect(a.score).toBe(50000);
      expect(a.riichi).toBe(0); // 他の変数は変更なし
    });
  });

  describe("正常系: 複数変数の同時上書き", () => {
    it("score と riichi が同時に上書きされる", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000, riichi: 0 },
        ]),
      });

      const { data } = await callForceEditScore({
        roomId,
        playerId: PLAYER_A,
        updates: { score: 30000, riichi: 3 },
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      expect(a.score).toBe(30000);
      expect(a.riichi).toBe(3);
    });
  });

  describe("正常系: 履歴とログ", () => {
    it("操作履歴に '強制編集' メッセージと操作前スナップショットが記録される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 25000 }]),
      });

      await callForceEditScore({
        roomId,
        playerId: PLAYER_A,
        updates: { score: 99999 },
        displayName: "Alice",
      });

      const history = await getRoomHistory(supabase, roomId);
      expect(history).toHaveLength(1);
      expect(history[0].message).toContain("強制編集");
      expect(history[0].message).toContain("Alice");
      expect(history[0].message).toContain("点数");

      const snapshot = history[0].snapshot as Record<string, unknown>;
      const snapA = snapshot[PLAYER_A] as Record<string, number>;
      expect(snapA.score).toBe(25000); // 操作前の値
    });
  });

  describe("異常系", () => {
    it("存在しない room_id → エラー 'ルームが見つかりません'", async () => {
      const { data } = await callForceEditScore({
        roomId: "00000000-0000-0000-0000-000000000000",
        playerId: PLAYER_A,
        updates: { score: 0 },
      });
      expect(data).toEqual({ error: "ルームが見つかりません" });
    });

    it("存在しないプレイヤー → エラー 'プレイヤーが見つかりません'", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A }]),
      });

      const { data } = await callForceEditScore({
        roomId,
        playerId: "nonexistent-player",
        updates: { score: 0 },
      });
      expect(data).toEqual({ error: "プレイヤーが見つかりません" });
    });
  });
});
