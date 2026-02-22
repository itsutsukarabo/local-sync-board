/**
 * ルーム入退室 API 仕様テスト（RLS 適用下）
 *
 * 対象: app/lib/roomApi.ts — createRoom, joinRoom, leaveRoom 相当の操作
 * 概要: Anonymous Auth で認証された Supabase クライアントを使い、
 *       RLS ポリシーが正しく機能した状態でルームの作成・入室が動作するかを検証する
 *
 * 前提:
 *   - ローカル Supabase が起動済み (supabase start)
 *   - マイグレーション適用済み (001〜008)
 *   - Anonymous Auth が有効（config.toml デフォルト）
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createServiceClient,
  createAnonUser,
  cleanupAnonUser,
  DEFAULT_TEMPLATE,
  type AnonUser,
} from "../helpers/supabase";

// ---- テスト共通 ----

let admin: SupabaseClient;
const users: AnonUser[] = [];
const roomIds: string[] = [];

/** テスト用ルームコードを生成 */
function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

beforeEach(() => {
  admin = createServiceClient();
});

afterEach(async () => {
  // ルーム削除（service_role で CASCADE）
  for (const id of roomIds) {
    await admin.from("rooms").delete().eq("id", id);
  }
  roomIds.length = 0;
  // ユーザー削除
  for (const u of users) {
    await cleanupAnonUser(admin, u.userId);
  }
  users.length = 0;
});

/** 匿名ユーザーを作成しトラッキングに追加 */
async function anonUser(): Promise<AnonUser> {
  const u = await createAnonUser();
  users.push(u);
  return u;
}

// ================================================================
// createRoom 相当: 認証済みユーザーがルームを作成する
// ================================================================
describe("createRoom: ルーム作成（RLS 適用下）", () => {
  it("認証済みユーザーが自分をホストとしてルームを作成できる", async () => {
    const host = await anonUser();
    const roomCode = genCode();

    const { data, error } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.room_code).toBe(roomCode);
    expect(data!.host_user_id).toBe(host.userId);
    expect(data!.status).toBe("waiting");
    roomIds.push(data!.id);
  });

  it("作成時に handle_new_user トリガーにより profiles レコードが自動生成されている", async () => {
    const host = await anonUser();

    const { data, error } = await host.client
      .from("profiles")
      .select("id, display_name")
      .eq("id", host.userId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe(host.userId);
    // 匿名ユーザーの初期 display_name は null
    expect(data!.display_name).toBeNull();
  });

  it("ルーム作成後に profiles.current_room_id を更新できる", async () => {
    const host = await anonUser();
    const roomCode = genCode();

    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select("id")
      .single();

    roomIds.push(room!.id);

    // 自分の profile を更新
    const { error: updateError } = await host.client
      .from("profiles")
      .update({ current_room_id: room!.id })
      .eq("id", host.userId);

    expect(updateError).toBeNull();

    const { data: profile } = await host.client
      .from("profiles")
      .select("current_room_id")
      .eq("id", host.userId)
      .single();

    expect(profile!.current_room_id).toBe(room!.id);
  });

  it("RLS: 他人の user_id をホストにしたルームは作成できない", async () => {
    const user = await anonUser();
    const fakeHostId = "00000000-0000-0000-0000-000000000099";

    const { error } = await user.client.from("rooms").insert({
      room_code: genCode(),
      host_user_id: fakeHostId,
      status: "waiting",
      template: DEFAULT_TEMPLATE,
      current_state: {},
    });

    expect(error).not.toBeNull();
  });
});

// ================================================================
// joinRoom 相当: 別のユーザーがルームコードで入室する
// ================================================================
describe("joinRoom: ルーム入室（RLS 適用下）", () => {
  it("別の認証済みユーザーがルームコードでルームを検索・取得できる", async () => {
    const host = await anonUser();
    const guest = await anonUser();
    const roomCode = genCode();

    // ホストがルーム作成
    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select()
      .single();

    roomIds.push(room!.id);

    // ゲストがルームコードで検索
    const { data: found, error } = await guest.client
      .from("rooms")
      .select("*")
      .eq("room_code", roomCode)
      .single();

    expect(error).toBeNull();
    expect(found).toBeDefined();
    expect(found!.id).toBe(room!.id);
    expect(found!.host_user_id).toBe(host.userId);
  });

  it("ゲストが入室時に自分の profiles.current_room_id を更新できる", async () => {
    const host = await anonUser();
    const guest = await anonUser();
    const roomCode = genCode();

    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select("id")
      .single();

    roomIds.push(room!.id);

    // ゲストが自分の profile を更新
    const { error } = await guest.client
      .from("profiles")
      .update({ current_room_id: room!.id })
      .eq("id", guest.userId);

    expect(error).toBeNull();

    const { data: profile } = await guest.client
      .from("profiles")
      .select("current_room_id")
      .eq("id", guest.userId)
      .single();

    expect(profile!.current_room_id).toBe(room!.id);
  });

  it("RLS: ゲストは他人の profiles.current_room_id を更新できない", async () => {
    const host = await anonUser();
    const guest = await anonUser();
    const roomCode = genCode();

    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select("id")
      .single();

    roomIds.push(room!.id);

    // ゲストがホストの profile を更新しようとする
    const { data, error } = await guest.client
      .from("profiles")
      .update({ current_room_id: room!.id })
      .eq("id", host.userId)
      .select();

    // RLS により対象行が見つからず、更新0件（エラーではなく空結果）
    expect(data).toHaveLength(0);
  });

  it("終了済みルームは status='finished' で判別できる", async () => {
    const host = await anonUser();
    const guest = await anonUser();
    const roomCode = genCode();

    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "finished",
        template: DEFAULT_TEMPLATE,
        current_state: {},
      })
      .select("id")
      .single();

    roomIds.push(room!.id);

    // ゲストがルームを検索
    const { data: found } = await guest.client
      .from("rooms")
      .select("status")
      .eq("room_code", roomCode)
      .single();

    expect(found!.status).toBe("finished");
  });
});

// ================================================================
// leaveRoom 相当: ルームからの退出
// ================================================================
describe("leaveRoom: ルーム退出（RLS 適用下）", () => {
  it("ゲストが退出時に current_state から自分のプレイヤーデータを削除できる", async () => {
    const host = await anonUser();
    const guest = await anonUser();
    const roomCode = genCode();

    // ホストがルーム作成（ゲストがプレイヤーとして登録済みの状態）
    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "playing",
        template: DEFAULT_TEMPLATE,
        current_state: {
          [host.userId]: { score: 25000, riichi: 0 },
          [guest.userId]: { score: 25000, riichi: 0 },
        },
        seats: [null, null, null, null],
      })
      .select()
      .single();

    roomIds.push(room!.id);

    // ゲストが current_state から自分を除外して更新
    const currentState = { ...room!.current_state };
    delete currentState[guest.userId];

    const { error } = await guest.client
      .from("rooms")
      .update({ current_state: currentState })
      .eq("id", room!.id);

    expect(error).toBeNull();

    // 確認: ゲストのエントリが消えている
    const { data: updated } = await admin
      .from("rooms")
      .select("current_state")
      .eq("id", room!.id)
      .single();

    expect(updated!.current_state[host.userId]).toBeDefined();
    expect(updated!.current_state[guest.userId]).toBeUndefined();
  });

  it("退出時に profiles.current_room_id を null にクリアできる", async () => {
    const guest = await anonUser();

    // 先に current_room_id をセット
    await guest.client
      .from("profiles")
      .update({ current_room_id: "00000000-0000-0000-0000-000000000001" })
      .eq("id", guest.userId);

    // クリア
    const { error } = await guest.client
      .from("profiles")
      .update({ current_room_id: null })
      .eq("id", guest.userId);

    expect(error).toBeNull();

    const { data: profile } = await guest.client
      .from("profiles")
      .select("current_room_id")
      .eq("id", guest.userId)
      .single();

    expect(profile!.current_room_id).toBeNull();
  });
});

// ================================================================
// deleteRoom 相当: ホストによるルーム削除
// ================================================================
describe("deleteRoom: ルーム削除（RLS 適用下）", () => {
  it("ホストは自分のルームを削除できる", async () => {
    const host = await anonUser();
    const roomCode = genCode();

    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
      })
      .select("id")
      .single();

    const { error } = await host.client
      .from("rooms")
      .delete()
      .eq("id", room!.id);

    expect(error).toBeNull();

    // 確認: ルームが存在しない
    const { data: check } = await admin
      .from("rooms")
      .select("id")
      .eq("id", room!.id);

    expect(check).toHaveLength(0);
  });

  it("RLS: ゲストは他人のルームを削除できない", async () => {
    const host = await anonUser();
    const guest = await anonUser();
    const roomCode = genCode();

    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
      })
      .select("id")
      .single();

    roomIds.push(room!.id);

    // ゲストが削除を試みる
    await guest.client.from("rooms").delete().eq("id", room!.id);

    // ルームはまだ存在する
    const { data: check } = await admin
      .from("rooms")
      .select("id")
      .eq("id", room!.id);

    expect(check).toHaveLength(1);
  });
});

// ================================================================
// room_name: ルーム名の設定・更新（RLS 適用下）
// ================================================================
describe("room_name: ルーム名の設定・更新（RLS 適用下）", () => {
  it("ルーム作成時に room_name を設定すると DB に保存される", async () => {
    const host = await anonUser();

    const { data, error } = await host.client
      .from("rooms")
      .insert({
        room_code: genCode(),
        room_name: "今日の麻雀",
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.room_name).toBe("今日の麻雀");
    roomIds.push(data!.id);
  });

  it("room_name を省略してもルームを作成できる（NULL 許容）", async () => {
    const host = await anonUser();

    const { data, error } = await host.client
      .from("rooms")
      .insert({
        room_code: genCode(),
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.room_name).toBeNull();
    roomIds.push(data!.id);
  });

  it("ホストは自分のルームの room_name を更新できる", async () => {
    const host = await anonUser();

    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: genCode(),
        room_name: "旧名前",
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select("id")
      .single();

    roomIds.push(room!.id);

    const { error } = await host.client
      .from("rooms")
      .update({ room_name: "新名前" })
      .eq("id", room!.id);

    expect(error).toBeNull();

    const { data: updated } = await admin
      .from("rooms")
      .select("room_name")
      .eq("id", room!.id)
      .single();

    expect(updated!.room_name).toBe("新名前");
  });

  it("RLS: ゲストは他人のルームの room_name を更新できない", async () => {
    const host = await anonUser();
    const guest = await anonUser();

    const { data: room } = await host.client
      .from("rooms")
      .insert({
        room_code: genCode(),
        room_name: "ホストの部屋",
        host_user_id: host.userId,
        status: "waiting",
        template: DEFAULT_TEMPLATE,
        current_state: {},
        seats: [null, null, null, null],
      })
      .select("id")
      .single();

    roomIds.push(room!.id);

    // ゲストが room_name を書き換えようとする
    const { data: result } = await guest.client
      .from("rooms")
      .update({ room_name: "乗っ取り" })
      .eq("id", room!.id)
      .select();

    // RLS により対象行が見つからず、更新0件
    expect(result).toHaveLength(0);

    // DB の値は変わっていない
    const { data: check } = await admin
      .from("rooms")
      .select("room_name")
      .eq("id", room!.id)
      .single();

    expect(check!.room_name).toBe("ホストの部屋");
  });
});
