// @vitest-environment jsdom
/**
 * useRoomRealtime フックのユニットテスト
 * Supabase をモックし、Realtime 購読ロジックを検証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── vi.hoisted でモック変数を宣言（vi.mock ファクトリ内から参照可能にする） ──

const {
  mockSingle,
  mockAbortSignal,
  mockEq,
  mockSelect,
  mockFrom,
  mockSubscribe,
  mockOn,
  mockChannel,
  mockRemoveChannel,
  callbacks,
} = vi.hoisted(() => {
  const callbacks = {
    subscribe: null as ((status: string, err?: any) => void) | null,
    update: null as ((payload: any) => void) | null,
    delete: null as ((payload: any) => void) | null,
  };

  const mockSingle = vi.fn();
  const mockAbortSignal = vi.fn(() => ({ single: mockSingle }));
  const mockEq = vi.fn(() => ({
    abortSignal: mockAbortSignal,
    single: mockSingle,
  }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));

  const mockChannel: any = {};

  const mockOn = vi.fn((_event: string, _filter: any, cb: any) => {
    if (_filter.event === "UPDATE") {
      callbacks.update = cb;
    } else if (_filter.event === "DELETE") {
      callbacks.delete = cb;
    }
    return mockChannel;
  });

  const mockSubscribe = vi.fn((cb: any) => {
    callbacks.subscribe = cb;
    return mockChannel;
  });

  mockChannel.on = mockOn;
  mockChannel.subscribe = mockSubscribe;

  const mockRemoveChannel = vi.fn();

  return {
    mockSingle,
    mockAbortSignal,
    mockEq,
    mockSelect,
    mockFrom,
    mockSubscribe,
    mockOn,
    mockChannel,
    mockRemoveChannel,
    callbacks,
  };
});

vi.mock("../../app/lib/supabase", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    channel: vi.fn(() => mockChannel),
    removeChannel: (...args: any[]) => mockRemoveChannel(...args),
  },
}));

vi.mock("../../app/utils/roomUtils", () => ({
  migrateTemplate: (t: any) => t,
}));

// ── テスト用データ ──

const ROOM_ID = "test-room-123";

function makeRoom(overrides?: Partial<any>) {
  return {
    id: ROOM_ID,
    room_code: "ABCD",
    host_user_id: "host-1",
    status: "playing",
    template: {
      variables: [{ key: "score", label: "点数", initial: 25000 }],
      hostPermissions: [],
      playerPermissions: [],
    },
    current_state: { player1: { score: 25000 } },
    seats: [null, null, null, null],
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

// テスト対象のインポート（モック設定後）
import { useRoomRealtime } from "../../app/hooks/useRoomRealtime";

describe("useRoomRealtime", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    callbacks.subscribe = null;
    callbacks.update = null;
    callbacks.delete = null;
    vi.clearAllMocks();

    // デフォルト: fetchInitialData が成功する
    mockSingle.mockResolvedValue({ data: makeRoom(), error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. stableRoomId 安定化 ──
  it("roomId が undefined に戻っても stableRoomId が維持される", async () => {
    const { result, rerender } = renderHook(
      ({ roomId }) => useRoomRealtime(roomId),
      { initialProps: { roomId: ROOM_ID as string | null } }
    );

    // 初期データ取得完了を待つ
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.room?.id).toBe(ROOM_ID);

    // roomId を undefined に変更
    rerender({ roomId: null });

    // room データは維持される（stableRoomId のおかげでクリーンアップが走らない）
    expect(result.current.room?.id).toBe(ROOM_ID);
  });

  // ── 2. 初期取得 ──
  it("fetchInitialData 完了後に room にデータがセットされ loading=false になる", async () => {
    const { result } = renderHook(() => useRoomRealtime(ROOM_ID));

    // 初期は loading=true
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.room).not.toBeNull();
    expect(result.current.room?.id).toBe(ROOM_ID);
    expect(result.current.error).toBeNull();
  });

  // ── 3. タイムアウト安全策 ──
  it("5秒間 roomId が null のまま → error がセットされる", async () => {
    const { result } = renderHook(() => useRoomRealtime(null));

    // 5秒進める
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error?.message).toBe("ルームIDを取得できませんでした");
  });

  // ── 4. 初回 SUBSCRIBED で refetch しない ──
  it("初回 SUBSCRIBED では refetch を呼ばない（lastManualRefetchTime が更新されない）", async () => {
    const { result } = renderHook(() => useRoomRealtime(ROOM_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // mockSingle の呼び出し回数をリセット
    const callCountBefore = mockSingle.mock.calls.length;

    // SUBSCRIBED を発火（初回）
    act(() => {
      callbacks.subscribe?.("SUBSCRIBED");
    });

    // debounce タイマー（300ms）を進める
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // 初回 SUBSCRIBED では refetch が追加で呼ばれないことを確認
    expect(mockSingle.mock.calls.length).toBe(callCountBefore);
  });

  // ── 5. 再接続 SUBSCRIBED で refetch する ──
  it("2回目の SUBSCRIBED（再接続）で refetch が呼ばれる", async () => {
    const { result } = renderHook(() => useRoomRealtime(ROOM_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 初回 SUBSCRIBED を発火（refetch しない）
    act(() => {
      callbacks.subscribe?.("SUBSCRIBED");
    });

    const callCountAfterFirst = mockSingle.mock.calls.length;

    // 2回目の SUBSCRIBED を発火（再接続 → refetch する）
    act(() => {
      callbacks.subscribe?.("SUBSCRIBED");
    });

    // debounce 300ms を進める
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // 再接続なので refetch が追加で呼ばれる
    await waitFor(() => {
      expect(mockSingle.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
    });
  });

  // ── 6. Realtime UPDATE でデータ更新 ──
  it("Realtime UPDATE ペイロードが完全な Room データを含む場合、setRoom が更新される", async () => {
    const { result } = renderHook(() => useRoomRealtime(ROOM_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // UPDATE ペイロードを発火
    const updatedRoom = makeRoom({
      current_state: { player1: { score: 30000 } },
    });

    act(() => {
      callbacks.update?.({ new: updatedRoom });
    });

    expect(result.current.room?.current_state?.player1?.score).toBe(30000);
  });

  // ── 7. DELETE でルーム消失 ──
  it("Realtime DELETE でルームが null になりエラーがセットされる", async () => {
    const { result } = renderHook(() => useRoomRealtime(ROOM_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      callbacks.delete?.({});
    });

    expect(result.current.room).toBeNull();
    expect(result.current.error?.message).toBe("ルームが削除されました");
  });

  // ── 8. CHANNEL_ERROR → 切断状態表示 ──
  it("CHANNEL_ERROR で isRealtimeDisconnected が true になる", async () => {
    const { result } = renderHook(() => useRoomRealtime(ROOM_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 初回 SUBSCRIBED
    act(() => {
      callbacks.subscribe?.("SUBSCRIBED");
    });

    // CHANNEL_ERROR
    act(() => {
      callbacks.subscribe?.("CHANNEL_ERROR");
    });

    expect(result.current.isRealtimeDisconnected).toBe(true);
  });

  // ── 9. 初期取得エラー ──
  it("fetchInitialData が失敗した場合 error がセットされる", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "Network error" },
    });

    const { result } = renderHook(() => useRoomRealtime(ROOM_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.room).toBeNull();
  });
});
