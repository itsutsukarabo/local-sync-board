/**
 * settlementUtils 純粋関数ユニットテスト
 * canExecuteSettlement・executeSettlement の実ロジックをモックなしで検証する。
 * （useGameActions.test.ts ではこれらがモックされているため、ここが唯一の実テスト）
 */

import { describe, it, expect } from "vitest";
import {
  canExecuteSettlement,
  executeSettlement,
} from "../../app/utils/settlementUtils";
import type {
  GameState,
  SeatInfo,
  Variable,
  SettlementConfig,
} from "../../app/types";

// ── テスト用ヘルパー ──

const scoreVar: Variable = { key: "score", label: "点数", initial: 25000 };
const variables: Variable[] = [scoreVar];

function makeSeat(userId: string, displayName?: string): SeatInfo {
  return {
    userId,
    status: "active",
    displayName: displayName ?? userId,
  };
}

// ── canExecuteSettlement ──

describe("canExecuteSettlement", () => {
  it("Pot残高が残っている場合は canExecute: false（reason に「供託金」含む）", () => {
    const currentState: GameState = {
      "user-1": { score: 25000 },
      "user-2": { score: 25000 },
      __pot__: { score: 1000 },
    };
    const seats: (SeatInfo | null)[] = [
      makeSeat("user-1"),
      makeSeat("user-2"),
      null,
      null,
    ];

    const result = canExecuteSettlement(currentState, seats, variables);

    expect(result.canExecute).toBe(false);
    expect(result.reason).toContain("供託金");
  });

  it("Pot自体は合計チェックに含まれない（Pot残高0で着席者合計が一致すれば通過）", () => {
    // __pot__: { score: 0 } が存在しても、expectedTotal の計算には含まれない
    const currentState: GameState = {
      "user-1": { score: 30000 },
      "user-2": { score: 20000 }, // 合計 50000 = 25000 × 2
      __pot__: { score: 0 },
    };
    const seats: (SeatInfo | null)[] = [
      makeSeat("user-1"),
      makeSeat("user-2"),
      null,
      null,
    ];

    const result = canExecuteSettlement(currentState, seats, variables);

    expect(result.canExecute).toBe(true);
  });

  it("着席者2人未満は canExecute: false", () => {
    const currentState: GameState = {
      "user-1": { score: 25000 },
    };
    const seats: (SeatInfo | null)[] = [makeSeat("user-1"), null, null, null];

    const result = canExecuteSettlement(currentState, seats, variables);

    expect(result.canExecute).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("合計点が不一致（初期値×人数と異なる）は canExecute: false", () => {
    const currentState: GameState = {
      "user-1": { score: 30000 },
      "user-2": { score: 30000 }, // 合計 60000 ≠ 25000 × 2 = 50000
    };
    const seats: (SeatInfo | null)[] = [
      makeSeat("user-1"),
      makeSeat("user-2"),
      null,
      null,
    ];

    const result = canExecuteSettlement(currentState, seats, variables);

    expect(result.canExecute).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("同点プレイヤーがいる場合は canExecute: false", () => {
    const currentState: GameState = {
      "user-1": { score: 25000 },
      "user-2": { score: 25000 }, // 同点
    };
    const seats: (SeatInfo | null)[] = [
      makeSeat("user-1"),
      makeSeat("user-2"),
      null,
      null,
    ];

    const result = canExecuteSettlement(currentState, seats, variables);

    expect(result.canExecute).toBe(false);
    expect(result.reason).toContain("同点");
  });

  it("全条件クリアで canExecute: true", () => {
    const currentState: GameState = {
      "user-1": { score: 30000 },
      "user-2": { score: 20000 }, // 合計 50000 = 25000 × 2、異なるスコア
    };
    const seats: (SeatInfo | null)[] = [
      makeSeat("user-1"),
      makeSeat("user-2"),
      null,
      null,
    ];

    const result = canExecuteSettlement(currentState, seats, variables);

    expect(result.canExecute).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

// ── executeSettlement ──

describe("executeSettlement", () => {
  const config: SettlementConfig = {
    divider: 1000,
    rankBonuses: {
      3: [15000, 0, -15000],
      4: [20000, 5000, -5000, -20000],
    },
  };

  it("score降順でランク付けされる", () => {
    // user-2 が最高得点 → 1位
    const currentState: GameState = {
      "user-1": { score: 20000 }, // 3位
      "user-2": { score: 38000 }, // 1位
      "user-3": { score: 24000 }, // 2位
      "user-4": { score: 18000 }, // 4位
    };
    const seats: (SeatInfo | null)[] = [
      makeSeat("user-1", "PlayerA"),
      makeSeat("user-2", "PlayerB"),
      makeSeat("user-3", "PlayerC"),
      makeSeat("user-4", "PlayerD"),
    ];

    const settlement = executeSettlement(currentState, seats, config, variables);

    expect(settlement.playerResults["user-2"].rank).toBe(1);
    expect(settlement.playerResults["user-3"].rank).toBe(2);
    expect(settlement.playerResults["user-1"].rank).toBe(3);
    expect(settlement.playerResults["user-4"].rank).toBe(4);
  });

  it("最下位の result が -(上位合計) で端数調整される", () => {
    // scores:     user-2:38000, user-3:24000, user-1:20000, user-4:18000
    // rankBonus:  +20000,       +5000,        -5000,        -20000
    // adjusted:   58000,        29000,        15000,        -2000
    // divided:    58.0,         29.0,         15.0,         -2.0
    // upperSum = 58.0 + 29.0 + 15.0 = 102.0
    // lastResult = -102.0
    const currentState: GameState = {
      "user-1": { score: 20000 },
      "user-2": { score: 38000 },
      "user-3": { score: 24000 },
      "user-4": { score: 18000 },
    };
    const seats: (SeatInfo | null)[] = [
      makeSeat("user-1", "PlayerA"),
      makeSeat("user-2", "PlayerB"),
      makeSeat("user-3", "PlayerC"),
      makeSeat("user-4", "PlayerD"),
    ];

    const settlement = executeSettlement(currentState, seats, config, variables);

    const upperSum =
      settlement.playerResults["user-2"].divided +
      settlement.playerResults["user-3"].divided +
      settlement.playerResults["user-1"].divided;
    expect(settlement.playerResults["user-4"].result).toBe(-upperSum);
    expect(settlement.playerResults["user-4"].result).toBe(-102.0);
  });

  it("playerResults に全着席者が含まれる", () => {
    const currentState: GameState = {
      "user-1": { score: 20000 },
      "user-2": { score: 38000 },
      "user-3": { score: 24000 },
      "user-4": { score: 18000 },
    };
    const seats: (SeatInfo | null)[] = [
      makeSeat("user-1", "PlayerA"),
      makeSeat("user-2", "PlayerB"),
      makeSeat("user-3", "PlayerC"),
      makeSeat("user-4", "PlayerD"),
    ];

    const settlement = executeSettlement(currentState, seats, config, variables);

    expect(Object.keys(settlement.playerResults)).toHaveLength(4);
    expect(settlement.playerResults["user-1"]).toBeDefined();
    expect(settlement.playerResults["user-2"]).toBeDefined();
    expect(settlement.playerResults["user-3"]).toBeDefined();
    expect(settlement.playerResults["user-4"]).toBeDefined();
  });
});
