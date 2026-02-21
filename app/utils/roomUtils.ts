/**
 * ルーム関連のユーティリティ関数
 */

import { GameTemplate, PotAction, Room } from "../types";

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
  layoutMode: "mahjong",
  maxPlayers: 4,
  potEnabled: true,
  variables: [{ key: "score", label: "点数", initial: 25000 }],
  potActions: [
    {
      id: "riichi",
      label: "リーチ",
      transfers: [{ variable: "score", amount: 1000 }],
    },
  ],
  hostPermissions: [
    "transfer_score",
    "retrieve_pot",
    "finalize_game",
    "force_edit",
    "reset_scores",
    "edit_template",
    "edit_counter",
  ],
  playerPermissions: ["transfer_score", "retrieve_pot"],
  settlementConfig: {
    divider: 1000,
    rankBonuses: {
      3: [5000, -40000, -70000],
      4: [10000, -20000, -40000, -50000],
    },
  },
};

/**
 * シンプルなスコアテンプレート
 */
export const SIMPLE_SCORE_TEMPLATE: GameTemplate = {
  layoutMode: "list",
  variables: [{ key: "score", label: "スコア", initial: 0 }],
  potEnabled: false,
  potActions: [],
  hostPermissions: [
    "transfer_score",
    "finalize_game",
    "force_edit",
    "reset_scores",
    "edit_template",
  ],
  playerPermissions: ["transfer_score"],
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

/**
 * 権限キーの表示用ラベル
 */
export const PERMISSION_LABELS: Record<string, string> = {
  transfer_score: "スコア移動",
  retrieve_pot: "供託金回収",
  finalize_game: "ゲーム終了",
  force_edit: "強制スコア編集",
  reset_scores: "スコアリセット",
  edit_template: "テンプレート編集",
};

/**
 * ユーザーがホスト（作成者またはコホスト）かどうかを判定
 */
export function isHostUser(
  userId: string | null | undefined,
  room: Room | null | undefined
): boolean {
  if (!userId || !room) return false;
  return (
    userId === room.host_user_id ||
    (room.co_host_ids ?? []).includes(userId)
  );
}

/**
 * 旧形式のPotAction（variable/amount）を新形式（transfers）に変換
 */
function migratePotActions(potActions: any[]): PotAction[] {
  return potActions.map((action: any) => {
    // 既に新形式（transfers配列あり）の場合はそのまま返す
    if (Array.isArray(action.transfers)) {
      return action;
    }
    // 旧形式（variable/amount）を新形式に変換
    return {
      id: action.id,
      label: action.label,
      transfers: [{ variable: action.variable, amount: action.amount }],
    };
  });
}

/**
 * 旧形式のテンプレートを新形式に変換するマイグレーション関数
 */
export function migrateTemplate(oldTemplate: any): GameTemplate {
  let template = oldTemplate;

  // 旧形式のpermissionsを新形式に変換
  if (template.permissions && !template.hostPermissions) {
    template = {
      ...template,
      hostPermissions: [
        ...template.permissions,
        "force_edit",
        "reset_scores",
        "edit_template",
      ],
      playerPermissions: template.permissions.filter(
        (p: string) => p !== "finalize_game",
      ),
      potActions: template.potActions || [
        {
          id: "default",
          label: "供託",
          transfers: [{ variable: "score", amount: 1000 }],
        },
      ],
      // riichi変数を削除
      variables: template.variables.filter((v: any) => v.key !== "riichi"),
    };
  }

  // potActionsの旧形式（variable/amount）を新形式（transfers）に変換
  if (template.potActions) {
    template = {
      ...template,
      potActions: migratePotActions(template.potActions),
    };
  }

  return template;
}
