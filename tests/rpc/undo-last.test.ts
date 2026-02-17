/**
 * rpc_undo_last 仕様テスト
 *
 * 対象: supabase/migrations/006_create_rpc_functions.sql — rpc_undo_last
 * 概要: 最新の操作履歴エントリの snapshot を復元し、そのエントリを削除する
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

beforeEach(async () => {
  supabase = createServiceClient();
  hostUserId = await createTestUser(supabase);
});

afterEach(async () => {
  if (roomId) await deleteTestRoom(supabase, roomId);
  if (hostUserId) await deleteTestUser(supabase, hostUserId);
});

/** transfer を実行して履歴を1件作る */
async function doTransfer(
  rId: string,
  fromId: string,
  toId: string,
  amount: number
) {
  return supabase.rpc("rpc_transfer_score", {
    p_room_id: rId,
    p_from_id: fromId,
    p_to_id: toId,
    p_transfers: [{ variable: "score", amount }],
    p_from_name: null,
    p_to_name: null,
  });
}

async function callUndoLast(rId: string) {
  const { data, error } = await supabase.rpc("rpc_undo_last", {
    p_room_id: rId,
  });
  return { data, error };
}

describe("rpc_undo_last", () => {
  describe("正常系: 直前の操作を取り消す", () => {
    it("current_state が操作前のスナップショットに復元される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      // 操作を実行（A → B: 8000）
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 8000);

      // undo
      const { data } = await callUndoLast(roomId);
      expect(data).toEqual({ success: true });

      // 元の状態に戻っている
      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(25000);
      expect(b.score).toBe(25000);
    });

    it("取り消された操作の履歴エントリが削除される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      await doTransfer(roomId, PLAYER_A, PLAYER_B, 1000);
      const historyBefore = await getRoomHistory(supabase, roomId);
      expect(historyBefore).toHaveLength(1);

      await callUndoLast(roomId);

      const historyAfter = await getRoomHistory(supabase, roomId);
      expect(historyAfter).toHaveLength(0);
    });
  });

  describe("正常系: 複数操作後のundo", () => {
    it("2回操作して1回undoすると、1回目の操作後の状態に戻る", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      // 1回目: A → B: 5000 → A:20000, B:30000
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 5000);
      // 2回目: A → B: 3000 → A:17000, B:33000
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 3000);

      // undo → 1回目の操作後の状態に戻る
      await callUndoLast(roomId);

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(20000);
      expect(b.score).toBe(30000);
    });
  });

  describe("正常系: 精算操作の undo", () => {
    it("精算操作を undo すると対応する room_settlements レコードも削除される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 30000 },
          { id: PLAYER_B, score: 20000 },
        ]),
      });

      const settlementId = crypto.randomUUID();
      await supabase.rpc("rpc_save_settlement", {
        p_room_id: roomId,
        p_settlement_id: settlementId,
        p_player_results: {
          [PLAYER_A]: { displayName: "A", rank: 1, result: 10 },
          [PLAYER_B]: { displayName: "B", rank: 2, result: -10 },
        },
      });

      const settlementsBefore = await getSettlements(supabase, roomId);
      expect(settlementsBefore).toHaveLength(1);

      await callUndoLast(roomId);

      const settlementsAfter = await getSettlements(supabase, roomId);
      expect(settlementsAfter).toHaveLength(0);
    });
  });

  describe("正常系: __recent_log__ のクリーンアップ", () => {
    it("undo した操作のメッセージが __recent_log__ から除去される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      await doTransfer(roomId, PLAYER_A, PLAYER_B, 1000);
      await callUndoLast(roomId);

      const state = await getRoomState(supabase, roomId);
      const log = (state.__recent_log__ ?? []) as Array<{
        message: string;
      }>;
      expect(log).toHaveLength(0);
    });
  });

  describe("異常系", () => {
    it("存在しない room_id → エラー 'ルームが見つかりません'", async () => {
      const { data } = await callUndoLast(
        "00000000-0000-0000-0000-000000000000"
      );
      expect(data).toEqual({ error: "ルームが見つかりません" });
    });

    it("履歴が空の場合 → エラー '取り消せる操作がありません'", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 25000 }]),
      });

      const { data } = await callUndoLast(roomId);
      expect(data).toEqual({ error: "取り消せる操作がありません" });
    });
  });
});
