/**
 * ルーム関連のユーティリティ関数
 */

import { GameTemplate } from "../types";

/**
 * 4文字のランダムなルームコードを生成（英数字大文字）
 * クライアント側でも生成するが、Supabase側で重複チェックを行う
 * 使用文字: A-Z, 0-9（紛らわしい文字を除外: O, 0, I, 1）
 */
export function generateRoomCode(): string {
  // 紛らわしい文字を除外した文字セット
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * ルームコードのバリデーション
 * @param code - 検証するルームコード
 * @returns バリデーション結果
 */
export function validateRoomCode(code: string): {
  valid: boolean;
  error?: string;
} {
  if (!code) {
    return { valid: false, error: "ルームコードを入力してください" };
  }

  if (code.length !== 4) {
    return { valid: false, error: "ルームコードは4桁である必要があります" };
  }

  if (!/^\d{4}$/.test(code)) {
    return {
      valid: false,
      error: "ルームコードは数字のみで構成される必要があります",
    };
  }

  return { valid: true };
}

/**
 * デフォルトのゲームテンプレート（麻雀）
 */
export const DEFAULT_MAHJONG_TEMPLATE: GameTemplate = {
  variables: [
    { key: "score", label: "点数", initial: 25000 },
    { key: "riichi", label: "リーチ棒", initial: 0 },
  ],
  actions: [
    { label: "リーチ", calc: "score - 1000; riichi + 1" },
    { label: "ロン 1000点", calc: "score + 1000" },
    { label: "ロン 2000点", calc: "score + 2000" },
    { label: "ロン 3900点", calc: "score + 3900" },
    { label: "ロン 5200点", calc: "score + 5200" },
    { label: "ロン 8000点", calc: "score + 8000" },
    { label: "ツモ 1000点", calc: "score + 1000" },
    { label: "ツモ 2000点", calc: "score + 2000" },
    { label: "ツモ 3900点", calc: "score + 3900" },
  ],
};

/**
 * シンプルなスコアテンプレート
 */
export const SIMPLE_SCORE_TEMPLATE: GameTemplate = {
  variables: [{ key: "score", label: "スコア", initial: 0 }],
  actions: [
    { label: "+1", calc: "score + 1" },
    { label: "+5", calc: "score + 5" },
    { label: "+10", calc: "score + 10" },
    { label: "-1", calc: "score - 1" },
    { label: "-5", calc: "score - 5" },
    { label: "-10", calc: "score - 10" },
  ],
};

/**
 * テンプレートのプリセット一覧
 */
export const TEMPLATE_PRESETS = {
  mahjong: DEFAULT_MAHJONG_TEMPLATE,
  simple: SIMPLE_SCORE_TEMPLATE,
};

/**
 * テンプレート名の表示用ラベル
 */
export const TEMPLATE_LABELS: Record<string, string> = {
  mahjong: "麻雀",
  simple: "シンプルスコア",
};
