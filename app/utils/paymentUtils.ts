/**
 * 支払いモーダル関連のユーティリティ関数
 */

import { Variable } from "../types";

/**
 * 変数に対応するクイック入力ステップ値の配列を返す。
 * variable.quickAmounts が設定されていればそれを優先し、
 * 未設定の場合は key ベースのデフォルトにフォールバックする。
 */
export function getSteps(variable: Variable): number[] {
  if (variable.quickAmounts && variable.quickAmounts.length > 0) {
    return variable.quickAmounts;
  }
  if (variable.key === "score") return [10000, 1000, 100];
  return [10, 1];
}

/**
 * カンマ区切りのテキストを正の整数の配列にパースする。
 * 有効な値（正の整数）が1件もなければ undefined を返す。
 */
export function parseQuickAmounts(text: string): number[] | undefined {
  const nums = text
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
  return nums.length > 0 ? nums : undefined;
}
