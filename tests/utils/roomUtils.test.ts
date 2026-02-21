/**
 * roomUtils.ts ユニットテスト
 */
import { describe, it, expect } from "vitest";
import { isHostUser } from "../../app/utils/roomUtils";
import type { Room } from "../../app/types";

// テスト用の最小 Room オブジェクトを生成するヘルパー
function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    room_code: "ABCD",
    host_user_id: "host-uid",
    co_host_ids: [],
    status: "waiting",
    template: {} as any,
    current_state: {},
    seats: [null, null, null, null],
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("isHostUser", () => {
  describe("作成者の判定", () => {
    it("host_user_id と一致するユーザーは true", () => {
      const room = makeRoom({ host_user_id: "host-uid", co_host_ids: [] });
      expect(isHostUser("host-uid", room)).toBe(true);
    });

    it("host_user_id と一致しないユーザーは false", () => {
      const room = makeRoom({ host_user_id: "host-uid", co_host_ids: [] });
      expect(isHostUser("other-uid", room)).toBe(false);
    });
  });

  describe("コホストの判定", () => {
    it("co_host_ids に含まれるユーザーは true", () => {
      const room = makeRoom({ co_host_ids: ["cohost-uid"] });
      expect(isHostUser("cohost-uid", room)).toBe(true);
    });

    it("co_host_ids に含まれない一般ユーザーは false", () => {
      const room = makeRoom({ co_host_ids: ["cohost-uid"] });
      expect(isHostUser("player-uid", room)).toBe(false);
    });

    it("複数コホストのうち一人が一致すれば true", () => {
      const room = makeRoom({ co_host_ids: ["cohost-1", "cohost-2", "cohost-3"] });
      expect(isHostUser("cohost-2", room)).toBe(true);
    });

    it("co_host_ids が空配列の場合はコホスト判定されない", () => {
      const room = makeRoom({ co_host_ids: [] });
      expect(isHostUser("anyone", room)).toBe(false);
    });

    it("co_host_ids が undefined（旧データ互換）でもクラッシュしない", () => {
      // DBマイグレーション前の旧レコードは co_host_ids が undefined になりうる
      const room = makeRoom({ co_host_ids: undefined as any });
      expect(isHostUser("anyone", room)).toBe(false);
    });
  });

  describe("null / undefined のエッジケース", () => {
    it("userId が null の場合は false", () => {
      const room = makeRoom();
      expect(isHostUser(null, room)).toBe(false);
    });

    it("userId が undefined の場合は false", () => {
      const room = makeRoom();
      expect(isHostUser(undefined, room)).toBe(false);
    });

    it("room が null の場合は false", () => {
      expect(isHostUser("host-uid", null)).toBe(false);
    });

    it("room が undefined の場合は false", () => {
      expect(isHostUser("host-uid", undefined)).toBe(false);
    });

    it("userId も room も null の場合は false", () => {
      expect(isHostUser(null, null)).toBe(false);
    });
  });
});
