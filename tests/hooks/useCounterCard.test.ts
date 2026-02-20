// @vitest-environment jsdom
/**
 * useCounterCard フックのユニットテスト
 *
 * 対象: app/hooks/useCounterCard.ts
 * 概要: デバウンス・CAS競合処理・編集セッション管理のロジックを検証
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCounterCard } from "../../app/hooks/useCounterCard";

describe("useCounterCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  // ── 1. 初期値 ──
  describe("初期値", () => {
    it("localValue は初期 serverValue と一致する", () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 5, onCommit })
      );
      expect(result.current.localValue).toBe(5);
    });
  });

  // ── 2. serverValue の同期 ──
  describe("serverValue の同期（Realtime）", () => {
    it("非編集中に serverValue が変化すると localValue が追随する", () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result, rerender } = renderHook(
        ({ serverValue }) => useCounterCard({ serverValue, onCommit }),
        { initialProps: { serverValue: 3 } }
      );

      rerender({ serverValue: 7 });

      expect(result.current.localValue).toBe(7);
    });

    it("編集中に serverValue が変化しても localValue は上書きされない", () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result, rerender } = renderHook(
        ({ serverValue }) => useCounterCard({ serverValue, onCommit }),
        { initialProps: { serverValue: 5 } }
      );

      act(() => { result.current.handlePress(1); }); // 編集セッション開始, localValue=6

      rerender({ serverValue: 10 }); // Realtime で更新

      expect(result.current.localValue).toBe(6); // 上書きされない
    });
  });

  // ── 3. handlePress ──
  describe("handlePress", () => {
    it("+1 で localValue が即時インクリメントされる", () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 0, onCommit })
      );

      act(() => { result.current.handlePress(1); });

      expect(result.current.localValue).toBe(1);
    });

    it("-1 で localValue が即時デクリメントされる", () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 3, onCommit })
      );

      act(() => { result.current.handlePress(-1); });

      expect(result.current.localValue).toBe(2);
    });

    it("複数回押下すると累積される", () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 0, onCommit })
      );

      act(() => { result.current.handlePress(1); });
      act(() => { result.current.handlePress(1); });
      act(() => { result.current.handlePress(1); });

      expect(result.current.localValue).toBe(3);
    });
  });

  // ── 4. デバウンス ──
  describe("デバウンス（3秒）", () => {
    it("3秒後に onCommit(baseValue, localValue) が呼ばれる", async () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 3, onCommit })
      );

      act(() => { result.current.handlePress(1); }); // localValue=4, baseValue=3

      expect(onCommit).not.toHaveBeenCalled();

      await act(async () => { vi.advanceTimersByTime(3000); });

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(3, 4);
    });

    it("3秒未満ではまだ呼ばれない", async () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 0, onCommit })
      );

      act(() => { result.current.handlePress(1); });

      await act(async () => { vi.advanceTimersByTime(2999); });

      expect(onCommit).not.toHaveBeenCalled();
    });

    it("連続押下でタイマーがリセットされ、最後の押下から3秒後に1回だけ呼ばれる", async () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 0, onCommit })
      );

      act(() => { result.current.handlePress(1); }); // t=0, localValue=1

      await act(async () => { vi.advanceTimersByTime(2000); }); // t=2000, 未発火

      act(() => { result.current.handlePress(1); }); // タイマーリセット, localValue=2

      await act(async () => { vi.advanceTimersByTime(2000); }); // t=4000, 未発火（最後の押下から2秒）

      expect(onCommit).not.toHaveBeenCalled();

      await act(async () => { vi.advanceTimersByTime(1000); }); // t=5000, 最後の押下から3秒 → 発火

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(0, 2);
    });

    it("localValue が serverValue と同じなら onCommit は呼ばれない", async () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 5, onCommit })
      );

      act(() => { result.current.handlePress(1); });  // +1 → localValue=6
      act(() => { result.current.handlePress(-1); }); // -1 → localValue=5（元に戻る）

      await act(async () => { vi.advanceTimersByTime(3000); });

      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  // ── 5. CAS（Compare-and-Swap）──
  describe("CAS の expected 値", () => {
    it("編集セッション開始時点のサーバー値が expected として使われる", async () => {
      const onCommit = vi.fn().mockResolvedValue({});
      const { result, rerender } = renderHook(
        ({ serverValue }) => useCounterCard({ serverValue, onCommit }),
        { initialProps: { serverValue: 5 } }
      );

      act(() => { result.current.handlePress(1); }); // 編集開始, baseValue=5, localValue=6

      rerender({ serverValue: 8 }); // Realtime で更新（baseValue は5のまま）

      await act(async () => { vi.advanceTimersByTime(3000); });

      expect(onCommit).toHaveBeenCalledWith(5, 6); // expected=5（編集開始時）, new=6
    });
  });

  // ── 6. 競合処理 ──
  describe("競合処理（conflictValue）", () => {
    it("conflictValue が返ると localValue が DB 値に強制上書きされる", async () => {
      const onCommit = vi.fn().mockResolvedValue({ conflictValue: 9 });
      const { result } = renderHook(() =>
        useCounterCard({ serverValue: 0, onCommit })
      );

      act(() => { result.current.handlePress(1); });

      await act(async () => { vi.advanceTimersByTime(3000); });

      expect(result.current.localValue).toBe(9);
    });

    it("競合解消後は再び serverValue の変化に追随する", async () => {
      const onCommit = vi.fn().mockResolvedValue({ conflictValue: 9 });
      const { result, rerender } = renderHook(
        ({ serverValue }) => useCounterCard({ serverValue, onCommit }),
        { initialProps: { serverValue: 0 } }
      );

      act(() => { result.current.handlePress(1); });

      await act(async () => { vi.advanceTimersByTime(3000); });

      // 競合後、isEditing=false に戻っているので Realtime 更新が反映される
      rerender({ serverValue: 12 });

      expect(result.current.localValue).toBe(12);
    });
  });
});
