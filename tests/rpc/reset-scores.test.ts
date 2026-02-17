/**
 * rpc_reset_scores 仕様テスト
 *
 * 対象: supabase/migrations/006_create_rpc_functions.sql — rpc_reset_scores
 * 概要: 指定した変数を全プレイヤー・Pot について初期値にリセットする
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
const PLAYER_B = "player-bbb-1234-5678-abcdefabcdef";

beforeEach(async () => {
  supabase = createServiceClient();
  hostUserId = await createTestUser(supabase);
});

afterEach(async () => {
  if (roomId) await deleteTestRoom(supabase, roomId);
  if (hostUserId) await deleteTestUser(supabase, hostUserId);
});

async function callResetScores(params: {
  roomId: string;
  variableKeys: string[];
}) {
  const { data, error } = await supabase.rpc("rpc_reset_scores", {
    p_room_id: params.roomId,
    p_variable_keys: params.variableKeys,
  });
  return { data, error };
}

describe("rpc_reset_scores", () => {
  describe("正常系: 単一変数のリセット", () => {
    it("全プレイヤーの score がテンプレート初期値 (25000) に戻る", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 10000 },
          { id: PLAYER_B, score: 40000 },
        ]),
      });

      const { data } = await callResetScores({
        roomId,
        variableKeys: ["score"],
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(25000);
      expect(b.score).toBe(25000);
    });

    it("リセット対象外の変数 (riichi) は変更されない", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 10000, riichi: 3 },
        ]),
      });

      await callResetScores({ roomId, variableKeys: ["score"] });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      expect(a.score).toBe(25000);
      expect(a.riichi).toBe(3); // 変更なし
    });
  });

  describe("正常系: 複数変数の同時リセット", () => {
    it("score と riichi の両方が初期値に戻る", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 10000, riichi: 5 },
          { id: PLAYER_B, score: 40000, riichi: 2 },
        ]),
      });

      const { data } = await callResetScores({
        roomId,
        variableKeys: ["score", "riichi"],
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(25000);
      expect(a.riichi).toBe(0);
      expect(b.score).toBe(25000);
      expect(b.riichi).toBe(0);
    });
  });

  describe("正常系: Pot のリセット", () => {
    it("__pot__ の該当変数が 0 にリセットされる", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState(
          [{ id: PLAYER_A, score: 20000 }],
          { score: 5000 }
        ),
      });

      await callResetScores({ roomId, variableKeys: ["score"] });

      const state = await getRoomState(supabase, roomId);
      const pot = state.__pot__ as Record<string, number>;
      expect(pot.score).toBe(0);
    });
  });

  describe("正常系: 履歴", () => {
    it("操作履歴に 'リセット' メッセージが記録される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 10000 }]),
      });

      await callResetScores({ roomId, variableKeys: ["score"] });

      const history = await getRoomHistory(supabase, roomId);
      expect(history).toHaveLength(1);
      expect(history[0].message).toContain("リセット");
      expect(history[0].message).toContain("点数");
    });
  });

  describe("正常系: テンプレートに存在しない変数キー", () => {
    it("テンプレートに存在しない変数キーは無視される（エラーにならない）", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 10000 }]),
      });

      const { data } = await callResetScores({
        roomId,
        variableKeys: ["nonexistent_var"],
      });

      expect(data).toEqual({ success: true });

      // score は変更されない
      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      expect(a.score).toBe(10000);
    });
  });

  describe("異常系", () => {
    it("存在しない room_id → エラー 'ルームが見つかりません'", async () => {
      const { data } = await callResetScores({
        roomId: "00000000-0000-0000-0000-000000000000",
        variableKeys: ["score"],
      });
      expect(data).toEqual({ error: "ルームが見つかりません" });
    });
  });
});
