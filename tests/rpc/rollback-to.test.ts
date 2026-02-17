/**
 * rpc_rollback_to 仕様テスト
 *
 * 対象: supabase/migrations/006_create_rpc_functions.sql — rpc_rollback_to
 * 概要: 指定した履歴エントリの snapshot まで状態を巻き戻し、
 *       それ以降の履歴・精算レコードを削除する
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

async function callRollbackTo(rId: string, historyId: string) {
  const { data, error } = await supabase.rpc("rpc_rollback_to", {
    p_room_id: rId,
    p_history_id: historyId,
  });
  return { data, error };
}

describe("rpc_rollback_to", () => {
  describe("正常系: 指定履歴時点への巻き戻し", () => {
    it("3回操作後、1回目の履歴にロールバックすると初期状態に復元される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      // 3回の操作
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 1000); // A:24000 B:26000
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 2000); // A:22000 B:28000
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 3000); // A:19000 B:31000

      // 1回目の履歴ID取得（最も古い = 初期状態のスナップショットを持つ）
      const history = await getRoomHistory(supabase, roomId);
      expect(history).toHaveLength(3);
      const oldestEntry = history[history.length - 1]; // 最も古い

      const { data } = await callRollbackTo(roomId, oldestEntry.id);
      expect(data).toEqual({ success: true });

      // 初期状態に復元
      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      const b = state[PLAYER_B] as Record<string, number>;
      expect(a.score).toBe(25000);
      expect(b.score).toBe(25000);
    });
  });

  describe("正常系: 履歴の整理", () => {
    it("ロールバック対象以降の履歴が削除され、ロールバック操作自体が新しい履歴として追加される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 25000 },
          { id: PLAYER_B, score: 25000 },
        ]),
      });

      await doTransfer(roomId, PLAYER_A, PLAYER_B, 1000);
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 2000);
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 3000);

      const history = await getRoomHistory(supabase, roomId);
      const oldestEntry = history[history.length - 1];

      await callRollbackTo(roomId, oldestEntry.id);

      // 元の3件は削除され、ロールバック操作の1件だけ残る
      const historyAfter = await getRoomHistory(supabase, roomId);
      expect(historyAfter).toHaveLength(1);
      expect(historyAfter[0].message).toContain("ロールバック");
    });
  });

  describe("正常系: 精算レコードの削除", () => {
    it("ロールバック対象以降の精算レコードも削除される", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([
          { id: PLAYER_A, score: 30000 },
          { id: PLAYER_B, score: 20000 },
        ]),
      });

      // 操作 → 精算 の順で実行
      await doTransfer(roomId, PLAYER_A, PLAYER_B, 1000);
      const historyAfterTransfer = await getRoomHistory(supabase, roomId);
      const transferHistoryId =
        historyAfterTransfer[historyAfterTransfer.length - 1].id;

      await supabase.rpc("rpc_save_settlement", {
        p_room_id: roomId,
        p_settlement_id: crypto.randomUUID(),
        p_player_results: {
          [PLAYER_A]: { displayName: "A", rank: 1, result: 10 },
          [PLAYER_B]: { displayName: "B", rank: 2, result: -10 },
        },
      });

      expect(await getSettlements(supabase, roomId)).toHaveLength(1);

      // transfer 履歴にロールバック → 精算も消える
      await callRollbackTo(roomId, transferHistoryId);

      expect(await getSettlements(supabase, roomId)).toHaveLength(0);
    });
  });

  describe("異常系", () => {
    it("存在しない room_id → エラー 'ルームが見つかりません'", async () => {
      const { data } = await callRollbackTo(
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000001"
      );
      expect(data).toEqual({ error: "ルームが見つかりません" });
    });

    it("存在しない history_id → エラー '指定された履歴が見つかりません'", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A, score: 25000 }]),
      });

      const { data } = await callRollbackTo(
        roomId,
        "00000000-0000-0000-0000-000000000099"
      );
      expect(data).toEqual({ error: "指定された履歴が見つかりません" });
    });
  });
});
