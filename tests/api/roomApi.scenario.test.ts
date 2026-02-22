/**
 * roomApi.ts シナリオテスト（Anonymous Auth + RLS + クライアント動的差し替え）
 *
 * roomApi.ts 内部の `supabase` を vi.mock で差し替え、
 * ホスト/ゲストの操作を 1 シナリオで順番に検証する。
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createServiceClient,
  createAnonUser,
  cleanupAnonUser,
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
import {
  createRoom,
  joinRoom,
  joinSeat,
  leaveSeat,
  leaveRoom,
  deleteRoom,
  joinFakeSeat,
  reseatFakePlayer,
  removeFakePlayer,
  updateCoHosts,
  updateRoomName,
} from "../../app/lib/roomApi";
import type { GameTemplate } from "../../app/types";

// ---- テスト用テンプレート ----

const TEST_TEMPLATE: GameTemplate = {
  variables: [{ key: "score", label: "点数", initial: 25000 }],
  hostPermissions: [
    "transfer_score",
    "finalize_game",
    "force_edit",
    "reset_scores",
  ],
  playerPermissions: ["transfer_score"],
  layoutMode: "mahjong",
  maxPlayers: 4,
  potEnabled: false,
};

// ---- テスト本体 ----

describe("roomApi シナリオテスト: 入室〜退室〜削除", () => {
  let admin: SupabaseClient;
  let host: AnonUser;
  let guest: AnonUser;
  let roomIdForCleanup: string | null = null;

  beforeEach(async () => {
    admin = createServiceClient();
    host = await createAnonUser();
    guest = await createAnonUser();
  });

  afterEach(async () => {
    // ルームが残っていれば service_role で削除
    if (roomIdForCleanup) {
      await admin.from("rooms").delete().eq("id", roomIdForCleanup);
      roomIdForCleanup = null;
    }
    await cleanupAnonUser(admin, guest.userId);
    await cleanupAnonUser(admin, host.userId);
  });

  /** service_role でルーム最新状態を取得 */
  async function getRoom(roomId: string) {
    const { data } = await admin
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    return data;
  }

  /** service_role でプロファイルを取得 */
  async function getProfile(userId: string) {
    const { data } = await admin
      .from("profiles")
      .select("current_room_id")
      .eq("id", userId)
      .single();
    return data;
  }

  it("ホスト作成→着席→ゲスト入室→着席→離席→退室→ホスト削除", async () => {
    // ======== 1. ホストがルームを作成 ========
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "テストルーム");

    expect(createError).toBeNull();
    expect(room).toBeDefined();
    expect(room.status).toBe("waiting");
    expect(room.host_user_id).toBe(host.userId);
    expect(room.seats).toEqual([null, null, null, null]);
    expect(room.current_state).toEqual({});

    const roomId = room.id;
    const roomCode = room.room_code;
    roomIdForCleanup = roomId;

    // DB: ホストの current_room_id が設定済み
    expect((await getProfile(host.userId))!.current_room_id).toBe(roomId);

    // ======== 2. ホストが席 0 に座る ========
    setClient(host.client);
    const { room: r2, error: e2 } = await joinSeat(roomId, 0);

    expect(e2).toBeNull();
    expect(r2!.seats[0]).toMatchObject({
      userId: host.userId,
      status: "active",
    });
    expect((r2!.current_state as any)[host.userId].score).toBe(25000);

    // ======== 3. ゲストがルームコードで入室 ========
    setClient(guest.client);
    const { room: r3, error: e3 } = await joinRoom(roomCode);

    expect(e3).toBeNull();
    expect(r3!.id).toBe(roomId);

    // DB: ゲストの current_room_id が設定済み
    expect((await getProfile(guest.userId))!.current_room_id).toBe(roomId);

    // ======== 4. ゲストが席 1 に座る ========
    setClient(guest.client);
    const { room: r4, error: e4 } = await joinSeat(roomId, 1);

    expect(e4).toBeNull();
    expect(r4!.seats[1]).toMatchObject({
      userId: guest.userId,
      status: "active",
    });
    expect((r4!.current_state as any)[guest.userId].score).toBe(25000);

    // DB: 2 人着席を確認
    const dbAfterBoth = await getRoom(roomId);
    expect(dbAfterBoth!.seats[0].userId).toBe(host.userId);
    expect(dbAfterBoth!.seats[1].userId).toBe(guest.userId);

    // ======== 5. ゲストが離席 ========
    setClient(guest.client);
    const { room: r5, error: e5 } = await leaveSeat(roomId);

    expect(e5).toBeNull();
    expect(r5!.seats[1]).toBeNull();

    // DB: current_state にはまだゲストのデータが残っている
    const dbAfterLeaveSeat = await getRoom(roomId);
    expect(dbAfterLeaveSeat!.current_state[guest.userId]).toBeDefined();

    // ======== 6. ゲストが退室 ========
    setClient(guest.client);
    const { error: e6 } = await leaveRoom(roomId);

    expect(e6).toBeNull();

    // DB: ゲストの current_room_id がクリア
    expect((await getProfile(guest.userId))!.current_room_id).toBeNull();

    // DB: current_state からゲストが削除、ホストは残存
    const dbAfterLeave = await getRoom(roomId);
    expect(dbAfterLeave!.current_state[guest.userId]).toBeUndefined();
    expect(dbAfterLeave!.current_state[host.userId]).toBeDefined();

    // ======== 7. ホストがルームを削除 ========
    setClient(host.client);
    const { error: e7 } = await deleteRoom(roomId);

    expect(e7).toBeNull();

    // DB: ルームが存在しない
    const { data: gone } = await admin
      .from("rooms")
      .select("id")
      .eq("id", roomId);
    expect(gone).toHaveLength(0);
    roomIdForCleanup = null; // 削除済み
  });
});

// ---- 架空プレイヤー シナリオ ----

describe("roomApi シナリオテスト: 架空プレイヤー追加・移動・削除", () => {
  let admin: SupabaseClient;
  let host: AnonUser;
  let roomIdForCleanup: string | null = null;

  beforeEach(async () => {
    admin = createServiceClient();
    host = await createAnonUser();
  });

  afterEach(async () => {
    if (roomIdForCleanup) {
      await admin.from("rooms").delete().eq("id", roomIdForCleanup);
      roomIdForCleanup = null;
    }
    await cleanupAnonUser(admin, host.userId);
  });

  /** service_role でルーム最新状態を取得 */
  async function getRoom(roomId: string) {
    const { data } = await admin
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    return data;
  }

  it("架空プレイヤー追加→席移動→削除", async () => {
    // ======== 1. ホストがルームを作成 ========
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "テストルーム");

    expect(createError).toBeNull();
    const roomId = room.id;
    roomIdForCleanup = roomId;

    // ======== 2. 架空プレイヤーを席 0 に追加 ========
    setClient(host.client);
    const { error: fakeError } = await joinFakeSeat(roomId, 0);

    expect(fakeError).toBeNull();

    const dbAfterFake = await getRoom(roomId);
    const seat0 = dbAfterFake!.seats[0];
    expect(seat0).not.toBeNull();
    expect(seat0.userId).toMatch(/^fake_/);
    expect(seat0.status).toBe("active");
    expect(seat0.isFake).toBe(true);
    expect(seat0.displayName).toBeDefined();

    const fakeId: string = seat0.userId;

    // current_state に初期スコアが設定されている
    expect(dbAfterFake!.current_state[fakeId]).toBeDefined();
    expect(dbAfterFake!.current_state[fakeId].score).toBe(25000);
    expect(dbAfterFake!.current_state[fakeId].__displayName__).toBe(
      seat0.displayName
    );

    // ======== 3. 架空プレイヤーを席 0 → 席 1 へ移動 ========
    // まず離席させてから reseat する（joinFakeSeat は着席済みの席を空けない）
    // removeFakePlayer は seats + current_state 両方消すので、
    // leaveSeat 相当の操作を forceLeaveSeat で行うか、
    // reseatFakePlayer が内部で席0→null にするわけではない。
    // reseatFakePlayer は「離席済みの fake を別席に再着席」なので、
    // 先に席 0 を空ける必要がある。
    // → forceLeaveSeat で席を空け、current_state は残し、reseat で席1へ。

    // 席 0 を手動で空ける（service_role で直接操作）
    const seatsForReseat = [...dbAfterFake!.seats];
    seatsForReseat[0] = null;
    await admin
      .from("rooms")
      .update({ seats: seatsForReseat })
      .eq("id", roomId);

    setClient(host.client);
    const { error: reseatError } = await reseatFakePlayer(roomId, fakeId, 1);

    expect(reseatError).toBeNull();

    const dbAfterReseat = await getRoom(roomId);
    expect(dbAfterReseat!.seats[0]).toBeNull();
    expect(dbAfterReseat!.seats[1]).not.toBeNull();
    expect(dbAfterReseat!.seats[1].userId).toBe(fakeId);
    expect(dbAfterReseat!.seats[1].isFake).toBe(true);
    // reseat 後も displayName が元のゲスト名（IDではない）であること
    expect(dbAfterReseat!.seats[1].displayName).toBe(seat0.displayName);
    expect(dbAfterReseat!.seats[1].displayName).not.toMatch(/^fake_/);

    // current_state は維持されている
    expect(dbAfterReseat!.current_state[fakeId]).toBeDefined();
    expect(dbAfterReseat!.current_state[fakeId].score).toBe(25000);

    // ======== 4. 架空プレイヤーを削除 ========
    setClient(host.client);
    const { error: removeError } = await removeFakePlayer(roomId, fakeId);

    expect(removeError).toBeNull();

    const dbAfterRemove = await getRoom(roomId);
    // 席 1 が空になっている
    expect(dbAfterRemove!.seats[1]).toBeNull();
    // current_state からも削除されている
    expect(dbAfterRemove!.current_state[fakeId]).toBeUndefined();
  });

  it("updateCoHosts: コホスト追加・更新・削除", async () => {
    // ======== 1. ホストがルームを作成 ========
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "テストルーム");

    expect(createError).toBeNull();
    const roomId = room.id;
    roomIdForCleanup = roomId;

    // 初期状態では co_host_ids が空
    const dbInitial = await getRoom(roomId);
    expect(dbInitial!.co_host_ids).toEqual([]);

    // ======== 2. 架空ユーザーIDをコホストに設定 ========
    const fakeCoHostId = "fake_cohost_test";
    setClient(host.client);
    const { error: addError } = await updateCoHosts(roomId, [fakeCoHostId]);

    expect(addError).toBeNull();

    const dbAfterAdd = await getRoom(roomId);
    expect(dbAfterAdd!.co_host_ids).toContain(fakeCoHostId);
    expect(dbAfterAdd!.co_host_ids).toHaveLength(1);

    // ======== 3. 別ユーザーも追加 ========
    const fakeCoHostId2 = "fake_cohost_test_2";
    setClient(host.client);
    const { error: addError2 } = await updateCoHosts(roomId, [fakeCoHostId, fakeCoHostId2]);

    expect(addError2).toBeNull();

    const dbAfterAdd2 = await getRoom(roomId);
    expect(dbAfterAdd2!.co_host_ids).toContain(fakeCoHostId);
    expect(dbAfterAdd2!.co_host_ids).toContain(fakeCoHostId2);
    expect(dbAfterAdd2!.co_host_ids).toHaveLength(2);

    // ======== 4. コホストを全削除（空配列） ========
    setClient(host.client);
    const { error: clearError } = await updateCoHosts(roomId, []);

    expect(clearError).toBeNull();

    const dbAfterClear = await getRoom(roomId);
    expect(dbAfterClear!.co_host_ids).toEqual([]);
  });

  it("離席中ゲストがいる状態で新規ゲストを追加すると displayName が衝突しない", async () => {
    // ======== 1. ホストがルームを作成 ========
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "テストルーム");

    expect(createError).toBeNull();
    const roomId = room.id;
    roomIdForCleanup = roomId;

    // ======== 2. ゲストAを席 0 に追加（displayName = "プレイヤーA"） ========
    setClient(host.client);
    const { error: fakeError1 } = await joinFakeSeat(roomId, 0);
    expect(fakeError1).toBeNull();

    const dbAfterFirst = await getRoom(roomId);
    const firstFakeSeat = dbAfterFirst!.seats[0];
    expect(firstFakeSeat).not.toBeNull();
    expect(firstFakeSeat.displayName).toBe("プレイヤーA");

    // ======== 3. 席 0 を手動で空ける（ゲストAは current_state に残存） ========
    // ※ current_state の __displayName__ は "プレイヤーA" のまま保持される
    const seatsWithEmpty = [...dbAfterFirst!.seats];
    seatsWithEmpty[0] = null;
    await admin
      .from("rooms")
      .update({ seats: seatsWithEmpty })
      .eq("id", roomId);

    // ======== 4. 新規ゲストを席 0 に追加 ========
    setClient(host.client);
    const { error: fakeError2 } = await joinFakeSeat(roomId, 0);
    expect(fakeError2).toBeNull();

    const dbAfterSecond = await getRoom(roomId);
    const newSeat = dbAfterSecond!.seats[0];
    expect(newSeat).not.toBeNull();

    // 離席中の "プレイヤーA" と衝突せず、"プレイヤーB" が割り当てられる
    expect(newSeat.displayName).toBe("プレイヤーB");
    expect(newSeat.displayName).not.toBe("プレイヤーA");
  });
});

// ---- コホスト権限 シナリオ ----

describe("roomApi シナリオテスト: コホスト権限", () => {
  let admin: SupabaseClient;
  let host: AnonUser;
  let coHost: AnonUser;
  let roomIdForCleanup: string | null = null;

  beforeEach(async () => {
    admin = createServiceClient();
    host = await createAnonUser();
    coHost = await createAnonUser();
  });

  afterEach(async () => {
    if (roomIdForCleanup) {
      await admin.from("rooms").delete().eq("id", roomIdForCleanup);
      roomIdForCleanup = null;
    }
    await cleanupAnonUser(admin, coHost.userId);
    await cleanupAnonUser(admin, host.userId);
  });

  /** service_role でルーム最新状態を取得 */
  async function getRoom(roomId: string) {
    const { data } = await admin
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    return data;
  }

  it("コホストが joinFakeSeat を呼び出せる（エラーにならない）", async () => {
    // ======== 1. ホストがルームを作成 ========
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "テストルーム");

    expect(createError).toBeNull();
    const roomId = room.id;
    roomIdForCleanup = roomId;

    // ======== 2. コホストをルームコードで入室 ========
    setClient(coHost.client);
    const { error: joinError } = await joinRoom(room.room_code);
    expect(joinError).toBeNull();

    // ======== 3. ホストがコホストを設定 ========
    setClient(host.client);
    const { error: coHostError } = await updateCoHosts(roomId, [coHost.userId]);
    expect(coHostError).toBeNull();

    const dbAfterCoHost = await getRoom(roomId);
    expect(dbAfterCoHost!.co_host_ids).toContain(coHost.userId);

    // ======== 4. コホストが架空ユーザーを席 0 に追加できる ========
    setClient(coHost.client);
    const { error: fakeError } = await joinFakeSeat(roomId, 0);

    expect(fakeError).toBeNull();

    const dbAfterFake = await getRoom(roomId);
    const seat0 = dbAfterFake!.seats[0];
    expect(seat0).not.toBeNull();
    expect(seat0.userId).toMatch(/^fake_/);
    expect(seat0.isFake).toBe(true);
  });

  it("コホスト権限を持たない一般ユーザーは joinFakeSeat がエラーになる", async () => {
    // ======== 1. ホストがルームを作成 ========
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "テストルーム");

    expect(createError).toBeNull();
    const roomId = room.id;
    roomIdForCleanup = roomId;

    // ======== 2. 一般ユーザーがルームコードで入室（コホスト設定なし） ========
    setClient(coHost.client);
    const { error: joinError } = await joinRoom(room.room_code);
    expect(joinError).toBeNull();

    // ======== 3. コホスト権限なしで架空ユーザー作成を試みる → エラー ========
    setClient(coHost.client);
    const { error: fakeError } = await joinFakeSeat(roomId, 0);

    expect(fakeError).not.toBeNull();
    expect(fakeError!.message).toContain("ホストのみが架空ユーザーを作成できます");
  });
});

// ---- ルーム名 シナリオ ----

describe("roomApi シナリオテスト: ルーム名", () => {
  let admin: SupabaseClient;
  let host: AnonUser;
  let guest: AnonUser;
  let roomIdForCleanup: string | null = null;

  beforeEach(async () => {
    admin = createServiceClient();
    host = await createAnonUser();
    guest = await createAnonUser();
  });

  afterEach(async () => {
    if (roomIdForCleanup) {
      await admin.from("rooms").delete().eq("id", roomIdForCleanup);
      roomIdForCleanup = null;
    }
    await cleanupAnonUser(admin, guest.userId);
    await cleanupAnonUser(admin, host.userId);
  });

  it("createRoom で指定したルーム名が DB に保存される", async () => {
    setClient(host.client);
    const { room, error } = await createRoom(TEST_TEMPLATE, "今日の麻雀");

    expect(error).toBeNull();
    expect(room.room_name).toBe("今日の麻雀");
    roomIdForCleanup = room.id;
  });

  it("updateRoomName でルーム名を変更できる", async () => {
    // ======== 1. ルームを作成 ========
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "初期名前");

    expect(createError).toBeNull();
    const roomId = room.id;
    roomIdForCleanup = roomId;

    // ======== 2. ルーム名を更新 ========
    setClient(host.client);
    const { error: updateError } = await updateRoomName(roomId, "新しい名前");

    expect(updateError).toBeNull();

    // DB の値を確認
    const { data: updated } = await admin
      .from("rooms")
      .select("room_name")
      .eq("id", roomId)
      .single();

    expect(updated!.room_name).toBe("新しい名前");
  });

  it("updateRoomName でルーム名を空文字にできる", async () => {
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "名前あり");

    expect(createError).toBeNull();
    const roomId = room.id;
    roomIdForCleanup = roomId;

    setClient(host.client);
    const { error: updateError } = await updateRoomName(roomId, "");

    expect(updateError).toBeNull();

    const { data: updated } = await admin
      .from("rooms")
      .select("room_name")
      .eq("id", roomId)
      .single();

    expect(updated!.room_name).toBe("");
  });

  it("ゲストは updateRoomName でホストのルーム名を変更できない", async () => {
    // ======== 1. ホストがルームを作成 ========
    setClient(host.client);
    const { room, error: createError } = await createRoom(TEST_TEMPLATE, "ホストの部屋");

    expect(createError).toBeNull();
    const roomId = room.id;
    roomIdForCleanup = roomId;

    // ======== 2. ゲストが入室 ========
    setClient(guest.client);
    const { error: joinError } = await joinRoom(room.room_code);
    expect(joinError).toBeNull();

    // ======== 3. ゲストが room_name を書き換えようとする ========
    setClient(guest.client);
    const { error: updateError } = await updateRoomName(roomId, "乗っ取り");

    // RLS によりエラーは発生しないが、DB の値は変わらない
    // (Supabase の update は RLS 違反時に 0 件更新で正常終了するケースがある)
    if (!updateError) {
      const { data: check } = await admin
        .from("rooms")
        .select("room_name")
        .eq("id", roomId)
        .single();

      expect(check!.room_name).toBe("ホストの部屋");
    }
  });
});
