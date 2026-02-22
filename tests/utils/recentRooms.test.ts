/**
 * recentRooms.ts ユニットテスト
 *
 * 対象: app/lib/recentRooms.ts
 * 概要: AsyncStorage を in-memory 実装で差し替え、
 *       各関数の振る舞いをユニットテストとして検証する
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- AsyncStorage を in-memory 実装で差し替え ----
// vitest.config.ts のエイリアスより vi.mock が優先される

const memStore: Record<string, string> = {};

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memStore[key] ?? null,
    setItem: async (key: string, value: string) => {
      memStore[key] = value;
    },
    removeItem: async (key: string) => {
      delete memStore[key];
    },
  },
}));

import {
  saveRecentRoom,
  loadRecentRooms,
  updateRecentRoomName,
  removeRecentRoom,
  filterRecentRooms,
} from "../../app/lib/recentRooms";
import type { RecentRoom } from "../../app/types";

// ---- ヘルパー ----

function makeEntry(overrides: Partial<RecentRoom> = {}): RecentRoom {
  return {
    roomId: "room-1",
    roomCode: "ABCD",
    joinedAt: Date.now(),
    templateName: "麻雀",
    ...overrides,
  };
}

beforeEach(() => {
  for (const key of Object.keys(memStore)) delete memStore[key];
});

// ================================================================
// saveRecentRoom
// ================================================================
describe("saveRecentRoom", () => {
  it("エントリを先頭に追加する", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1", roomCode: "AAAA" }));
    await saveRecentRoom(makeEntry({ roomId: "room-2", roomCode: "BBBB" }));

    const rooms = await loadRecentRooms();

    expect(rooms[0].roomId).toBe("room-2");
    expect(rooms[1].roomId).toBe("room-1");
  });

  it("同じ roomId のエントリは重複せず先頭に移動する", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1", roomCode: "AAAA" }));
    await saveRecentRoom(makeEntry({ roomId: "room-2", roomCode: "BBBB" }));
    await saveRecentRoom(
      makeEntry({ roomId: "room-1", roomCode: "AAAA", roomName: "更新後" })
    );

    const rooms = await loadRecentRooms();

    expect(rooms).toHaveLength(2);
    expect(rooms[0].roomId).toBe("room-1");
    expect(rooms[0].roomName).toBe("更新後");
  });

  it("roomName を含むエントリを保存・復元できる", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1", roomName: "今日の麻雀" }));

    const rooms = await loadRecentRooms();

    expect(rooms[0].roomName).toBe("今日の麻雀");
  });

  it("roomName を省略したエントリも保存できる", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1" }));

    const rooms = await loadRecentRooms();

    expect(rooms[0].roomName).toBeUndefined();
  });
});

// ================================================================
// updateRecentRoomName
// ================================================================
describe("updateRecentRoomName", () => {
  it("該当 roomId のエントリの roomName を更新する", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1", roomName: "旧名前" }));

    await updateRecentRoomName("room-1", "新名前");

    const rooms = await loadRecentRooms();
    expect(rooms[0].roomName).toBe("新名前");
  });

  it("他のエントリの roomName は変更しない", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1", roomName: "部屋A" }));
    await saveRecentRoom(makeEntry({ roomId: "room-2", roomName: "部屋B" }));

    await updateRecentRoomName("room-1", "部屋A改");

    const rooms = await loadRecentRooms();
    const r2 = rooms.find((r) => r.roomId === "room-2");
    expect(r2?.roomName).toBe("部屋B");
  });

  it("存在しない roomId を指定しても他のエントリに影響しない", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1", roomName: "部屋A" }));

    await updateRecentRoomName("nonexistent", "無関係");

    const rooms = await loadRecentRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomName).toBe("部屋A");
  });

  it("roomName を空文字に更新できる", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1", roomName: "名前あり" }));

    await updateRecentRoomName("room-1", "");

    const rooms = await loadRecentRooms();
    expect(rooms[0].roomName).toBe("");
  });

  it("roomName が未設定のエントリに後から roomName をセットできる", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1" }));

    await updateRecentRoomName("room-1", "後付け名前");

    const rooms = await loadRecentRooms();
    expect(rooms[0].roomName).toBe("後付け名前");
  });

  it("roomId / roomCode / joinedAt など他のフィールドは保持される", async () => {
    const original = makeEntry({
      roomId: "room-1",
      roomCode: "ZZZZ",
      joinedAt: 1000000,
      templateName: "テスト",
      roomName: "旧名前",
    });
    await saveRecentRoom(original);

    await updateRecentRoomName("room-1", "新名前");

    const rooms = await loadRecentRooms();
    const r = rooms[0];
    expect(r.roomCode).toBe("ZZZZ");
    expect(r.joinedAt).toBe(1000000);
    expect(r.templateName).toBe("テスト");
    expect(r.roomName).toBe("新名前");
  });
});

// ================================================================
// removeRecentRoom
// ================================================================
describe("removeRecentRoom", () => {
  it("指定した roomId のエントリを削除する", async () => {
    await saveRecentRoom(makeEntry({ roomId: "room-1" }));
    await saveRecentRoom(makeEntry({ roomId: "room-2" }));

    await removeRecentRoom("room-1");

    const rooms = await loadRecentRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomId).toBe("room-2");
  });
});

// ================================================================
// filterRecentRooms
// ================================================================
describe("filterRecentRooms", () => {
  it("12時間以内のエントリのみ返す", () => {
    const now = Date.now();
    const old = makeEntry({ roomId: "old", joinedAt: now - 13 * 60 * 60 * 1000 });
    const recent = makeEntry({ roomId: "recent", joinedAt: now - 1 * 60 * 60 * 1000 });

    const result = filterRecentRooms([old, recent]);

    expect(result).toHaveLength(1);
    expect(result[0].roomId).toBe("recent");
  });
});
