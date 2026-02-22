/**
 * renameFakePlayer API 仕様テスト
 *
 * 対象: app/lib/roomApi.ts — renameFakePlayer
 * 概要: ゲストプレイヤーの表示名を変更する際に
 *       seats[i].displayName と current_state[fakeUserId].__displayName__ の両方が
 *       更新されることを検証する
 *
 * 前提:
 *   - ローカル Supabase が起動済み (supabase start)
 *   - マイグレーション適用済み
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createServiceClient,
  createAnonUser,
  cleanupAnonUser,
  createTestRoomWithSeats,
  deleteTestRoom,
  makePlayerState,
  type AnonUser,
} from "../helpers/supabase";

// ---- クライアント動的差し替えの仕組み ----

const { getClient, setClient } = vi.hoisted(() => {
  let client: any = null;
  return {
    getClient: () => client,
    setClient: (c: any) => {
      client = c;
    },
  };
});

vi.mock("../../app/lib/supabase", () => ({
  get supabase() {
    return getClient();
  },
}));

// roomApi 関数（mock 適用後にインポート）
import { renameFakePlayer } from "../../app/lib/roomApi";

let admin: SupabaseClient;
const users: AnonUser[] = [];
const roomIds: string[] = [];

beforeEach(() => {
  admin = createServiceClient();
});

afterEach(async () => {
  for (const id of roomIds) {
    await deleteTestRoom(admin, id);
  }
  roomIds.length = 0;
  for (const u of users) {
    await cleanupAnonUser(admin, u.userId);
  }
  users.length = 0;
});

async function setupHostAndRoom(fakeUserId: string, fakeDisplayName: string) {
  const host = await createAnonUser();
  users.push(host);

  const currentState = makePlayerState([
    { id: fakeUserId, score: 25000, displayName: fakeDisplayName },
  ]);

  const seats = [
    { userId: fakeUserId, status: "active", displayName: fakeDisplayName, isFake: true },
    null,
    null,
    null,
  ];

  const roomId = await createTestRoomWithSeats(admin, host.userId, {
    currentState,
    seats,
  });
  roomIds.push(roomId);

  // renameFakePlayer がホストの認証済みクライアントを使うよう差し込む
  setClient(host.client);

  return { hostId: host.userId, roomId };
}

describe("renameFakePlayer", () => {
  it("正常系: seats と current_state の両方に新しい名前が反映される", async () => {
    const fakeUserId = `fake_${Date.now()}_test`;
    const { roomId } = await setupHostAndRoom(fakeUserId, "プレイヤーA");

    const { error } = await renameFakePlayer(roomId, fakeUserId, "太郎");

    expect(error).toBeNull();

    // DB から直接取得して検証
    const { data } = await admin
      .from("rooms")
      .select("seats, current_state")
      .eq("id", roomId)
      .single();

    expect(data).not.toBeNull();

    // seats の displayName が更新されていること
    const seat = (data!.seats as any[]).find((s: any) => s && s.userId === fakeUserId);
    expect(seat?.displayName).toBe("太郎");

    // current_state の __displayName__ が更新されていること
    const playerState = data!.current_state[fakeUserId] as Record<string, unknown>;
    expect(playerState.__displayName__).toBe("太郎");
  });

  it("異常系: 存在しない fakeUserId を渡した場合、エラーなしでスキップされる", async () => {
    const fakeUserId = `fake_${Date.now()}_test`;
    const nonExistentId = `fake_does_not_exist`;
    const { roomId } = await setupHostAndRoom(fakeUserId, "プレイヤーA");

    const { error } = await renameFakePlayer(roomId, nonExistentId, "新しい名前");

    // エラーが返らないこと（冪等性）
    expect(error).toBeNull();

    // 既存のゲストは変更されていないこと
    const { data } = await admin
      .from("rooms")
      .select("seats, current_state")
      .eq("id", roomId)
      .single();

    const seat = (data!.seats as any[]).find((s: any) => s && s.userId === fakeUserId);
    expect(seat?.displayName).toBe("プレイヤーA");

    const playerState = data!.current_state[fakeUserId] as Record<string, unknown>;
    expect(playerState.__displayName__).toBe("プレイヤーA");
  });
});
