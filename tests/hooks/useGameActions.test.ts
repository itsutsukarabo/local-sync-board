// @vitest-environment jsdom
/**
 * useGameActions フックのユニットテスト
 * roomApi / settlementUtils をモックし、ゲーム操作ハンドラを検証
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Room, User } from "../../app/types";

// ── モック定義 ──

const mockJoinSeat = vi.fn();
const mockJoinFakeSeat = vi.fn();
const mockReseatFakePlayer = vi.fn();
const mockForceLeaveSeat = vi.fn();
const mockLeaveSeat = vi.fn();
const mockTransferScore = vi.fn();
const mockRollbackTo = vi.fn();
const mockUndoLast = vi.fn();
const mockSaveSettlement = vi.fn();
const mockFetchSettlements = vi.fn();
const mockJoinGame = vi.fn();

vi.mock("../../app/lib/roomApi", () => ({
  joinSeat: (...args: any[]) => mockJoinSeat(...args),
  joinFakeSeat: (...args: any[]) => mockJoinFakeSeat(...args),
  reseatFakePlayer: (...args: any[]) => mockReseatFakePlayer(...args),
  forceLeaveSeat: (...args: any[]) => mockForceLeaveSeat(...args),
  leaveSeat: (...args: any[]) => mockLeaveSeat(...args),
  transferScore: (...args: any[]) => mockTransferScore(...args),
  rollbackTo: (...args: any[]) => mockRollbackTo(...args),
  undoLast: (...args: any[]) => mockUndoLast(...args),
  saveSettlement: (...args: any[]) => mockSaveSettlement(...args),
  fetchSettlements: (...args: any[]) => mockFetchSettlements(...args),
  joinGame: (...args: any[]) => mockJoinGame(...args),
}));

vi.mock("../../app/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

const mockCanExecuteSettlement = vi.fn();
const mockExecuteSettlement = vi.fn();

vi.mock("../../app/utils/settlementUtils", () => ({
  canExecuteSettlement: (...args: any[]) => mockCanExecuteSettlement(...args),
  executeSettlement: (...args: any[]) => mockExecuteSettlement(...args),
}));

// Alert.alert をモック（ボタンの onPress を自動実行するヘルパーも提供）
const mockAlert = vi.fn();
vi.mock("react-native", () => ({
  Alert: { alert: (...args: any[]) => mockAlert(...args) },
  Platform: { OS: "web" },
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

// テスト対象のインポート（モック設定後）
import { useGameActions } from "../../app/hooks/useGameActions";

// ── テスト用データ ──

function makeRoom(overrides?: Partial<Room>): Room {
  return {
    id: "room-1",
    room_code: "ABCD",
    host_user_id: "host-1",
    status: "playing",
    template: {
      variables: [{ key: "score", label: "点数", initial: 25000 }],
      hostPermissions: [],
      playerPermissions: [],
    },
    current_state: {
      "user-1": { score: 25000 },
      "user-2": { score: 25000 },
    },
    seats: [
      { userId: "user-1", status: "active", displayName: "Player1" },
      { userId: "user-2", status: "active", displayName: "Player2" },
      null,
      null,
    ],
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const mockUser = { id: "user-1" } as User;
const mockShowToast = vi.fn();

function defaultParams() {
  return {
    room: makeRoom(),
    user: mockUser,
    isHost: true,
    showToast: mockShowToast,
  };
}

describe("useGameActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSettlements.mockResolvedValue({ settlements: [], error: null });
  });

  // ── 1. isProcessing 排他制御 ──
  describe("isProcessing 排他制御", () => {
    it("handleTransfer 実行中は isProcessing が true になる", async () => {
      // transferScore をゆっくり解決させる
      let resolveTransfer: (value: any) => void;
      mockTransferScore.mockReturnValue(
        new Promise((resolve) => {
          resolveTransfer = resolve;
        })
      );

      const { result } = renderHook(() => useGameActions(defaultParams()));

      expect(result.current.isProcessing).toBe(false);

      // handleTransfer を開始（await しない）
      let transferPromise: Promise<void>;
      act(() => {
        transferPromise = result.current.handleTransfer(
          "user-1",
          "user-2",
          [{ variable: "score", amount: 1000 }]
        );
      });

      expect(result.current.isProcessing).toBe(true);

      // 解決
      await act(async () => {
        resolveTransfer!({ error: null });
        await transferPromise!;
      });

      expect(result.current.isProcessing).toBe(false);
    });

    it("isProcessing が true の間は handleTransfer が二重実行されない", async () => {
      let resolveFirst: (value: any) => void;
      mockTransferScore.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      );

      const { result } = renderHook(() => useGameActions(defaultParams()));

      // 1回目の呼び出し
      let firstPromise: Promise<void>;
      act(() => {
        firstPromise = result.current.handleTransfer(
          "user-1",
          "user-2",
          [{ variable: "score", amount: 1000 }]
        );
      });

      // 2回目の呼び出し（isProcessing が true なのでスキップされるはず）
      act(() => {
        result.current.handleTransfer(
          "user-1",
          "user-2",
          [{ variable: "score", amount: 2000 }]
        );
      });

      await act(async () => {
        resolveFirst!({ error: null });
        await firstPromise!;
      });

      // transferScore は1回だけ呼ばれるはず
      expect(mockTransferScore).toHaveBeenCalledTimes(1);
    });
  });

  // ── 2. handleTransfer ──
  describe("handleTransfer", () => {
    it("成功時に toast('success') が表示される", async () => {
      mockTransferScore.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleTransfer(
          "user-1",
          "user-2",
          [{ variable: "score", amount: 1000 }]
        );
      });

      expect(mockShowToast).toHaveBeenCalledWith("success", "支払いが完了しました");
    });

    it("失敗時に toast('error') が表示される", async () => {
      mockTransferScore.mockResolvedValue({
        error: new Error("転送エラー"),
      });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleTransfer(
          "user-1",
          "user-2",
          [{ variable: "score", amount: 1000 }]
        );
      });

      expect(mockShowToast).toHaveBeenCalledWith("error", "転送エラー");
    });

    it("displayName を seats から取得して transferScore に渡す", async () => {
      mockTransferScore.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleTransfer(
          "user-1",
          "user-2",
          [{ variable: "score", amount: 1000 }]
        );
      });

      expect(mockTransferScore).toHaveBeenCalledWith(
        "room-1",
        "user-1",
        "user-2",
        [{ variable: "score", amount: 1000 }],
        "Player1",
        "Player2"
      );
    });
  });

  // ── 3. handleJoinSeat ──
  describe("handleJoinSeat", () => {
    it("joinSeat が成功する", async () => {
      mockJoinSeat.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleJoinSeat(2);
      });

      expect(mockJoinSeat).toHaveBeenCalledWith("room-1", 2);
    });

    it("joinSeat がエラーを返した場合 Alert が表示される", async () => {
      mockJoinSeat.mockResolvedValue({
        error: new Error("座席が埋まっています"),
      });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleJoinSeat(2);
      });

      expect(mockAlert).toHaveBeenCalledWith("エラー", "座席が埋まっています");
    });
  });

  // ── 4. handleSettlement ──
  describe("handleSettlement", () => {
    it("canExecuteSettlement が false の場合 Alert 表示", () => {
      mockCanExecuteSettlement.mockReturnValue({
        canExecute: false,
        reason: "供託金が残っています",
      });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      act(() => {
        result.current.handleSettlement();
      });

      expect(mockAlert).toHaveBeenCalledWith(
        "精算不可",
        "供託金が残っています"
      );
    });

    it("canExecuteSettlement が true の場合 確認ダイアログ表示", () => {
      mockCanExecuteSettlement.mockReturnValue({ canExecute: true });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      act(() => {
        result.current.handleSettlement();
      });

      expect(mockAlert).toHaveBeenCalledWith(
        "確認",
        "半荘の精算を実行しますか？\nスコアは初期値にリセットされます。",
        expect.any(Array)
      );
    });
  });

  // ── 5. settlementCount 更新 ──
  describe("settlementCount", () => {
    it("room が変わると fetchSettlements が呼ばれカウントが更新される", async () => {
      mockFetchSettlements.mockResolvedValue({
        settlements: [{ id: "s1" }, { id: "s2" }],
        error: null,
      });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await waitFor(() => {
        expect(result.current.settlementCount).toBe(2);
      });
    });

    it("handleSettlementComplete で最新カウントに更新される", async () => {
      mockFetchSettlements
        .mockResolvedValueOnce({ settlements: [], error: null })
        .mockResolvedValueOnce({
          settlements: [{ id: "s1" }],
          error: null,
        });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      // 初期取得
      await waitFor(() => {
        expect(result.current.settlementCount).toBe(0);
      });

      // handleSettlementComplete
      await act(async () => {
        await result.current.handleSettlementComplete();
      });

      expect(result.current.settlementCount).toBe(1);
    });
  });

  // ── 6. handleRollback ──
  describe("handleRollback", () => {
    it("成功時にエラーが表示されない", async () => {
      mockRollbackTo.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleRollback("history-1");
      });

      expect(mockRollbackTo).toHaveBeenCalledWith("room-1", "history-1");
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it("失敗時に toast('error') が表示される", async () => {
      mockRollbackTo.mockResolvedValue({
        error: new Error("ロールバック失敗"),
      });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleRollback("history-1");
      });

      expect(mockShowToast).toHaveBeenCalledWith("error", "ロールバック失敗");
    });
  });

  // ── 7. handleUndo ──
  describe("handleUndo", () => {
    it("成功時にエラーが表示されない", async () => {
      mockUndoLast.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleUndo();
      });

      expect(mockUndoLast).toHaveBeenCalledWith("room-1");
      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  // ── 8. handleForceLeave ──
  describe("handleForceLeave", () => {
    it("forceLeaveSeat を正しく呼び出す", async () => {
      mockForceLeaveSeat.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useGameActions(defaultParams()));

      await act(async () => {
        await result.current.handleForceLeave("user-2");
      });

      expect(mockForceLeaveSeat).toHaveBeenCalledWith("room-1", "user-2");
    });
  });

  // ── 9. 着席操作の排他制御 ──
  describe("着席操作の排他制御", () => {

    // 9-1: handleJoinSeat（通常着席）= グローバルロック
    describe("handleJoinSeat（通常着席）", () => {
      it("実行中は isJoining が true になる", async () => {
        let resolve: (v: any) => void;
        mockJoinSeat.mockReturnValue(new Promise(r => { resolve = r; }));
        const { result } = renderHook(() => useGameActions(defaultParams()));

        expect(result.current.isJoining).toBe(false);
        let p: Promise<void>;
        act(() => { p = result.current.handleJoinSeat(2); });
        expect(result.current.isJoining).toBe(true);

        await act(async () => { resolve!({ error: null }); await p!; });
        expect(result.current.isJoining).toBe(false);
      });

      it("isJoining が true の間は別の seatIndex もブロックされる", async () => {
        let resolve: (v: any) => void;
        mockJoinSeat.mockReturnValueOnce(new Promise(r => { resolve = r; }));
        const { result } = renderHook(() => useGameActions(defaultParams()));

        let p: Promise<void>;
        act(() => { p = result.current.handleJoinSeat(2); });

        act(() => { result.current.handleJoinSeat(3); }); // ブロックされる

        await act(async () => { resolve!({ error: null }); await p!; });
        expect(mockJoinSeat).toHaveBeenCalledTimes(1);
      });

      it("エラーでも isJoining が false に戻る", async () => {
        mockJoinSeat.mockRejectedValue(new Error("network error"));
        const { result } = renderHook(() => useGameActions(defaultParams()));

        await act(async () => { await result.current.handleJoinSeat(2); });
        expect(result.current.isJoining).toBe(false);
      });
    });

    // 9-2: handleJoinFakeSeat（ゲスト着席）= per-seat スピナー + キュー直列
    describe("handleJoinFakeSeat（ゲスト着席）", () => {
      it("実行中は joiningGuestSeats にその seatIndex が含まれる", async () => {
        let resolve: (v: any) => void;
        mockJoinFakeSeat.mockReturnValue(new Promise(r => { resolve = r; }));
        const params = { ...defaultParams(), room: makeRoom({ seats: [null, null, null, null], current_state: {} }) };
        const { result } = renderHook(() => useGameActions(params));

        expect(result.current.joiningGuestSeats.has(2)).toBe(false);
        let p: Promise<void>;
        act(() => { p = result.current.handleJoinFakeSeat(2); });
        expect(result.current.joiningGuestSeats.has(2)).toBe(true);

        await act(async () => { resolve!({ error: null }); await p!; });
        expect(result.current.joiningGuestSeats.has(2)).toBe(false);
      });

      it("別の seatIndex はタップ可能でスピナーが表示され、API は直列に実行される", async () => {
        let resolveFirst: (v: any) => void;
        mockJoinFakeSeat
          .mockReturnValueOnce(new Promise(r => { resolveFirst = r; }))
          .mockResolvedValue({ error: null });

        const params = { ...defaultParams(), room: makeRoom({ seats: [null, null, null, null], current_state: {} }) };
        const { result } = renderHook(() => useGameActions(params));

        act(() => { result.current.handleJoinFakeSeat(0); });
        expect(result.current.joiningGuestSeats.has(0)).toBe(true);

        // seat0 の .then() マイクロタスクをフラッシュして API 呼び出しを開始させる
        await act(async () => {});

        let secondPromise: Promise<void>;
        act(() => { secondPromise = result.current.handleJoinFakeSeat(1); });
        expect(result.current.joiningGuestSeats.has(1)).toBe(true);

        // この時点では API は1回のみ（seat1 はキュー待ち）
        expect(mockJoinFakeSeat).toHaveBeenCalledTimes(1);

        // seat0 完了 → seat1 の API が直列に実行される
        await act(async () => {
          resolveFirst!({ error: null });
          await secondPromise!;
        });

        expect(mockJoinFakeSeat).toHaveBeenCalledTimes(2);
        expect(result.current.joiningGuestSeats.size).toBe(0);
      });

      it("同じ seatIndex は二重実行されない", async () => {
        let resolve: (v: any) => void;
        mockJoinFakeSeat.mockReturnValueOnce(new Promise(r => { resolve = r; }));
        const params = { ...defaultParams(), room: makeRoom({ seats: [null, null, null, null], current_state: {} }) };
        const { result } = renderHook(() => useGameActions(params));

        let p: Promise<void>;
        act(() => { p = result.current.handleJoinFakeSeat(2); });
        act(() => { result.current.handleJoinFakeSeat(2); }); // 同じ → ブロック

        await act(async () => { resolve!({ error: null }); await p!; });
        expect(mockJoinFakeSeat).toHaveBeenCalledTimes(1);
      });

      it("エラーでも joiningGuestSeats から seatIndex が削除される", async () => {
        mockJoinFakeSeat.mockRejectedValue(new Error("network error"));
        const params = { ...defaultParams(), room: makeRoom({ seats: [null, null, null, null], current_state: {} }) };
        const { result } = renderHook(() => useGameActions(params));

        await act(async () => { await result.current.handleJoinFakeSeat(2); });
        expect(result.current.joiningGuestSeats.has(2)).toBe(false);
      });
    });
  });

  // ── 10. room が null の場合のガード ──
  describe("null ガード", () => {
    it("room が null のとき handleTransfer は何もしない", async () => {
      const params = { ...defaultParams(), room: null };
      const { result } = renderHook(() => useGameActions(params));

      await act(async () => {
        await result.current.handleTransfer(
          "user-1",
          "user-2",
          [{ variable: "score", amount: 1000 }]
        );
      });

      expect(mockTransferScore).not.toHaveBeenCalled();
    });

    it("room が null のとき handleSettlement は何もしない", () => {
      const params = { ...defaultParams(), room: null };
      const { result } = renderHook(() => useGameActions(params));

      act(() => {
        result.current.handleSettlement();
      });

      expect(mockCanExecuteSettlement).not.toHaveBeenCalled();
      expect(mockAlert).not.toHaveBeenCalled();
    });
  });
});
