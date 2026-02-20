/**
 * rpc_update_counter 仕様テスト
 *
 * 対象: supabase/migrations/009_add_rpc_update_counter.sql — rpc_update_counter
 * 概要: Compare-and-Swap でカウンター値を更新する
 *   - expected値がDB値と一致する場合のみ更新
 *   - 不一致の場合は競合として現在値を返す
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

async function callUpdateCounter(params: {
  roomId: string;
  expectedValue: number;
  newValue: number;
}) {
  const { data, error } = await supabase.rpc("rpc_update_counter", {
    p_room_id: params.roomId,
    p_expected_value: params.expectedValue,
    p_new_value: params.newValue,
  });
  return { data, error };
}

describe("rpc_update_counter", () => {
  describe("正常系", () => {
    it("expected値が一致する → __count__ が new_value に更新される", async () => {
      const initialState = {
        ...makePlayerState([{ id: PLAYER_A }]),
        __count__: 3,
      };
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: initialState,
      });

      const { data } = await callUpdateCounter({
        roomId,
        expectedValue: 3,
        newValue: 5,
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      expect(state.__count__).toBe(5);
    });

    it("__count__ が未設定(=0扱い)の state で expected=0 → 初回設定できる", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A }]),
      });

      const { data } = await callUpdateCounter({
        roomId,
        expectedValue: 0,
        newValue: 1,
      });

      expect(data).toEqual({ success: true });

      const state = await getRoomState(supabase, roomId);
      expect(state.__count__).toBe(1);
    });

    it("他のプレイヤー state は変更されない", async () => {
      const initialState = {
        ...makePlayerState([{ id: PLAYER_A, score: 30000 }]),
        __count__: 2,
      };
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: initialState,
      });

      await callUpdateCounter({ roomId, expectedValue: 2, newValue: 4 });

      const state = await getRoomState(supabase, roomId);
      const a = state[PLAYER_A] as Record<string, number>;
      expect(a.score).toBe(30000);
    });
  });

  describe("競合系", () => {
    it("expected値がDB値と不一致 → { conflict: true, current_value: <db値> } を返す・DBは変更されない", async () => {
      const initialState = {
        ...makePlayerState([{ id: PLAYER_A }]),
        __count__: 7,
      };
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: initialState,
      });

      const { data } = await callUpdateCounter({
        roomId,
        expectedValue: 5, // DBは7なので不一致
        newValue: 10,
      });

      expect(data).toEqual({ conflict: true, current_value: 7 });

      // DBは変更されない
      const state = await getRoomState(supabase, roomId);
      expect(state.__count__).toBe(7);
    });

    it("__count__ 未設定(=0)に対して expected=5 → 競合扱い・current_value=0 を返す", async () => {
      roomId = await createTestRoom(supabase, hostUserId, {
        currentState: makePlayerState([{ id: PLAYER_A }]),
      });

      const { data } = await callUpdateCounter({
        roomId,
        expectedValue: 5, // DBは0(未設定)なので不一致
        newValue: 6,
      });

      expect(data).toEqual({ conflict: true, current_value: 0 });

      // DBに__count__は設定されない
      const state = await getRoomState(supabase, roomId);
      expect(state.__count__).toBeUndefined();
    });
  });

  describe("異常系", () => {
    it("存在しない room_id → { error: 'ルームが見つかりません' }", async () => {
      const { data } = await callUpdateCounter({
        roomId: "00000000-0000-0000-0000-000000000000",
        expectedValue: 0,
        newValue: 1,
      });
      expect(data).toEqual({ error: "ルームが見つかりません" });
    });
  });
});
