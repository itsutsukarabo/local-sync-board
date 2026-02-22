/**
 * paymentUtils.ts ユニットテスト
 */
import { describe, it, expect } from "vitest";
import { getSteps, parseQuickAmounts } from "../../app/utils/paymentUtils";
import type { Variable } from "../../app/types";

// テスト用ヘルパー
function makeVariable(overrides: Partial<Variable> = {}): Variable {
  return { key: "score", label: "点数", initial: 0, ...overrides };
}

// -------------------------------------------------------------------
describe("getSteps", () => {
  describe("quickAmounts が設定されている場合", () => {
    it("quickAmounts の値をそのまま返す", () => {
      const v = makeVariable({ quickAmounts: [500, 100, 50] });
      expect(getSteps(v)).toEqual([500, 100, 50]);
    });

    it("key が score であっても quickAmounts を優先する", () => {
      const v = makeVariable({ key: "score", quickAmounts: [200, 50] });
      expect(getSteps(v)).toEqual([200, 50]);
    });

    it("要素が1件だけでも返す", () => {
      const v = makeVariable({ quickAmounts: [1000] });
      expect(getSteps(v)).toEqual([1000]);
    });
  });

  describe("quickAmounts が未設定または空の場合（キーベースフォールバック）", () => {
    it("quickAmounts が undefined で key=score → [10000, 1000, 100]", () => {
      const v = makeVariable({ key: "score", quickAmounts: undefined });
      expect(getSteps(v)).toEqual([10000, 1000, 100]);
    });

    it("quickAmounts プロパティ自体がない場合も score フォールバック", () => {
      const v = makeVariable({ key: "score" });
      expect(getSteps(v)).toEqual([10000, 1000, 100]);
    });

    it("quickAmounts が空配列の場合も score フォールバック", () => {
      const v = makeVariable({ key: "score", quickAmounts: [] });
      expect(getSteps(v)).toEqual([10000, 1000, 100]);
    });

    it("key が score 以外で quickAmounts 未設定 → [10, 1]", () => {
      const v = makeVariable({ key: "chip", quickAmounts: undefined });
      expect(getSteps(v)).toEqual([10, 1]);
    });

    it("key が空文字でも [10, 1] を返す", () => {
      const v = makeVariable({ key: "" });
      expect(getSteps(v)).toEqual([10, 1]);
    });
  });
});

// -------------------------------------------------------------------
describe("parseQuickAmounts", () => {
  describe("正常系", () => {
    it("カンマ区切りの正整数を配列に変換する", () => {
      expect(parseQuickAmounts("10000, 1000, 100")).toEqual([10000, 1000, 100]);
    });

    it("前後のスペースを除去して正しくパースする", () => {
      expect(parseQuickAmounts("  500 , 100 , 50 ")).toEqual([500, 100, 50]);
    });

    it("要素が1件だけの場合も配列を返す", () => {
      expect(parseQuickAmounts("300")).toEqual([300]);
    });

    it("スペースなしのカンマ区切りも処理できる", () => {
      expect(parseQuickAmounts("10000,1000,100")).toEqual([10000, 1000, 100]);
    });
  });

  describe("フィルタリング", () => {
    it("文字列混じりでも有効な数値だけ返す", () => {
      expect(parseQuickAmounts("100, abc, 50")).toEqual([100, 50]);
    });

    it("ゼロを除外する", () => {
      expect(parseQuickAmounts("0, 100, 50")).toEqual([100, 50]);
    });

    it("負数を除外する", () => {
      expect(parseQuickAmounts("-10, 100, -1")).toEqual([100]);
    });

    it("ゼロ・負数・文字列が混在しても正の整数だけ返す", () => {
      expect(parseQuickAmounts("0, -5, abc, 200, 100")).toEqual([200, 100]);
    });
  });

  describe("undefined を返すケース", () => {
    it("空文字は undefined", () => {
      expect(parseQuickAmounts("")).toBeUndefined();
    });

    it("スペースのみは undefined", () => {
      expect(parseQuickAmounts("   ")).toBeUndefined();
    });

    it("全て不正な値は undefined", () => {
      expect(parseQuickAmounts("abc, -1, 0")).toBeUndefined();
    });

    it("カンマだけは undefined", () => {
      expect(parseQuickAmounts(",,,")).toBeUndefined();
    });
  });
});
