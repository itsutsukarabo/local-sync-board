/**
 * rpc_save_settlement / rpc_save_adjustment 仕様テスト
 *
 * 対象: supabase/migrations/006_create_rpc_functions.sql
 *       — rpc_save_settlement: 精算保存 + score リセット
 *       — rpc_save_adjustment: 調整行保存（スコア変更なし）
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
  getSettlements,
  makePlayerState,
} from "../helpers/supabase";

let supabase: SupabaseClient;
let hostUserId: string;
let roomId: string;

const PLAYER_A = "player-aaa-1234-5678-abcdefabcdef";
const PLAYER_B = "player-bbb-1234-5678-abcdefabcdef";

const PLAYER_RESULTS = {
  [PLAYER_A]: { displayName: "Alice", rank: 1, result: 15.5 },
  [PLAYER_B]: { displayName: "Bob", rank: 2, result: -15.5 },
};

beforeEach(async () => {
  supabase = createServiceClient();
  hostUserId = await createTestUser(supabase);
});

afterEach(async () => {
  if (roomId) await deleteTestRoom(supabase, roomId);
  if (hostUserId) await deleteTestUser(supabase, hostUserId);
});

async function callSaveSettlement(params: {
  roomId: string;
  settlementId: string;
  playerResults: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc("rpc_save_settlement", {
    p_room_id: params.roomId,
    p_settlement_id: params.settlementId,
    p_player_results: params.playerResults,
  });
  return { data, error };
}

async function callSaveAdjustment(params: {
  roomId: string;
  settlementId: string;
  playerResults: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc("rpc_save_adjustment", {
    p_room_id: params.roomId,
    p_settlement_id: params.settlementId,
    p_player_results: params.playerResults,
  });
  return { data, error };
}

// ================================================================
// rpc_save_settlement
// ================================================================
describe("rpc_save_settlement", () => {
  describe("正常系: 精算保存とスコアリセット", () => {
    it("精算後に全プレイヤーの score がテンプレート初期値 (25000) にリセットされる", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 35000 },
          { id: PLAYER_B, score: 15000 },
        ]),
      });

      const { data } = await callSaveSettlement({
        roomId,
        settlementId: crypto.randomUUID(),
        playerResults: PLAYER_RESULTS,
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(25000);
      expect(b.score).toBe(25000);
    });

    it("score 以外の変数 (riichi) はリセットされない", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 30000, riichi: 3 },
        ]),
      });

      await callSaveSettlement({
        roomId,
        settlementId: crypto.randomUUID(),
        playerResults: {
          [PLAYER_A]: { displayName: "Alice", rank: 1, result: 5 },
        },
      });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      expect(a.score).toBe(25000); // リセット
      expect(a.riichi).toBe(3); // 変更なし
    });

    it("Pot の score も 0 にリセットされる", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState(
          [{ id: PLAYER_A, score: 20000 }],
          { score: 5000 }
        ),
      });

      await callSaveSettlement({
        roomId,
        settlementId: crypto.randomUUID(),
        playerResults: {
          [PLAYER_A]: { displayName: "A", rank: 1, result: 0 },
        },
      });

      const state = await getRoomState(supabase, roomId);
      const pot = state.__pot__ as Record<string, number>;
      expect(pot.score).toBe(0);
    });
  });

  describe("正常系: レコード作成", () => {
    it("room_settlements に type='settlement' のレコードが作成される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 30000 },
          { id: PLAYER_B, score: 20000 },
        ]),
      });

      const settlementId = crypto.randomUUID();
      await callSaveSettlement({
        roomId,
        settlementId,
        playerResults: PLAYER_RESULTS,
      });

      const settlements = await getSettlements(supabase, roomId);
      expect(settlements).toHaveLength(1);
      expect(settlements[0].id).toBe(settlementId);
      expect(settlements[0].type).toBe("settlement");
    });

    it("操作履歴に '精算' メッセージが記録され、rank 順にソートされる", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 30000 },
          { id: PLAYER_B, score: 20000 },
        ]),
      });

      await callSaveSettlement({
        roomId,
        settlementId: crypto.randomUUID(),
        playerResults: PLAYER_RESULTS,
      });

      const history = await getRoomHistory(supabase, roomId);
      expect(history).toHaveLength(1);
      expect(history[0].message).toContain("精算");
      // rank=1 の Alice が先
      expect(history[0].message).toMatch(/Alice.*Bob/);
      // +/- 表記
      expect(history[0].message).toContain("+15.5");
      expect(history[0].message).toContain("-15.5");
    });
  });

  describe("異常系", () => {
    it("存在しない room_id → エラー 'ルームが見つかりません'", async () => {
      const { data } = await callSaveSettlement({
        roomId: "00000000-0000-0000-0000-000000000000",
        settlementId: crypto.randomUUID(),
        playerResults: PLAYER_RESULTS,
      });
      expect(data).toEqual({ error: "ルームが見つかりません" });
    });
  });
});

// ================================================================
// rpc_save_adjustment
// ================================================================
describe("rpc_save_adjustment", () => {
  describe("正常系: 調整行の保存", () => {
    it("current_state のスコアは変更されない（調整はレコードのみ）", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      const { data } = await callSaveAdjustment({
        roomId,
        settlementId: crypto.randomUUID(),
        playerResults: {
          [PLAYER_A]: { displayName: "Alice", rank: 1, result: 5 },
          [PLAYER_B]: { displayName: "Bob", rank: 2, result: -5 },
        },
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(25000); // 変更なし
      expect(b.score).toBe(25000); // 変更なし
    });
  });

  describe("正常系: レコード作成", () => {
    it("room_settlements に type='adjustment' のレコードが作成される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 25000 }]),
      });

      const adjustmentId = crypto.randomUUID();
      await callSaveAdjustment({
        roomId,
        settlementId: adjustmentId,
        playerResults: {
          [PLAYER_A]: { displayName: "Alice", rank: 1, result: 3 },
        },
      });

      const settlements = await getSettlements(supabase, roomId);
      expect(settlements).toHaveLength(1);
      expect(settlements[0].id).toBe(adjustmentId);
      expect(settlements[0].type).toBe("adjustment");
    });

    it("result=0 のプレイヤーは履歴メッセージに含まれない", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      await callSaveAdjustment({
        roomId,
        settlementId: crypto.randomUUID(),
        playerResults: {
          [PLAYER_A]: { displayName: "Alice", rank: 1, result: 10 },
          [PLAYER_B]: { displayName: "Bob", rank: 2, result: 0 },
        },
      });

      const history = await getRoomHistory(supabase, roomId);
      expect(history[0].message).toContain("調整");
      expect(history[0].message).toContain("Alice");
      expect(history[0].message).not.toContain("Bob");
    });
  });

  describe("異常系", () => {
    it("存在しない room_id → エラー 'ルームが見つかりません'", async () => {
      const { data } = await callSaveAdjustment({
        roomId: "00000000-0000-0000-0000-000000000000",
        settlementId: crypto.randomUUID(),
        playerResults: {},
      });
      expect(data).toEqual({ error: "ルームが見つかりません" });
    });
  });
});
