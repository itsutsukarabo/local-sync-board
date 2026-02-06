// データモデル型定義 (docs/03_Data_Model.md に基づく)

// ============================================
// 認証関連の型定義
// ============================================

import { User as SupabaseUser, Session } from "@supabase/supabase-js";

/**
 * Supabase Auth User型のエクスポート
 */
export type User = SupabaseUser;

/**
 * Supabase Session型のエクスポート
 */
export type AuthSession = Session;

/**
 * ユーザープロファイル (profiles テーブル)
 */
export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  current_room_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * プロファイル更新用の型（部分更新可能）
 */
export type ProfileUpdate = Partial<
  Omit<Profile, "id" | "created_at" | "updated_at">
>;

/**
 * 認証コンテキストの型定義
 */
export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: AuthSession | null;
  loading: boolean;
  signInAnonymously: () => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
}

// ============================================
// ルーム関連の型定義
// ============================================

/**
 * 座席情報
 */
export interface SeatInfo {
  userId: string | null;
  status: "active" | "inactive";
}

/**
 * ゲームセッション (rooms テーブル)
 */
export interface Room {
  id: string;
  room_code: string;
  host_user_id: string;
  status: "waiting" | "playing" | "finished";
  template: GameTemplate;
  current_state: GameState;
  seats: (SeatInfo | null)[]; // 座席配列 [Bottom, Right, Top, Left]
  created_at: string;
}

/**
 * レイアウトモード
 */
export type LayoutMode = "list" | "mahjong";

/**
 * 権限キー定義
 * - transfer_score: プレイヤー間でのスコア移動
 * - retrieve_pot: 供託金（Pot）からの回収
 * - finalize_game: ゲーム終了・精算操作
 * - force_edit: 強制編集（他プレイヤーのスコア操作）
 * - reset_scores: スコアリセット
 * - edit_template: テンプレート編集（変数追加、初期値変更等）
 */
export type PermissionKey =
  | "transfer_score"
  | "retrieve_pot"
  | "finalize_game"
  | "force_edit"
  | "reset_scores"
  | "edit_template";

/**
 * Pot操作の個別転送定義
 */
export interface PotTransfer {
  variable: string; // 対象の変数キー（例: "score"）
  amount: number; // 移動量（例: 1000）
}

/**
 * Pot操作定義
 */
export interface PotAction {
  id: string; // 一意のID
  label: string; // 表示名（例: "リーチ"）
  transfers: PotTransfer[]; // 転送リスト（複数変数対応）
}

/**
 * ゲームテンプレート定義（拡張版）
 * ゲームのルール（変数と権限）を定義
 */
export interface GameTemplate {
  variables: Variable[];
  hostPermissions: PermissionKey[]; // ホストの権限
  playerPermissions: PermissionKey[]; // プレイヤーの権限
  layoutMode?: LayoutMode; // デフォルトは "list"
  maxPlayers?: number; // 最大プレイヤー数（麻雀モードでは4）
  potEnabled?: boolean; // 供託金機能の有効化
  potActions?: PotAction[]; // Pot操作の定義リスト
  forceLeaveTimeoutSec?: number; // 切断後の強制離席までの秒数
}

/**
 * 変数定義
 * 例: { key: "score", label: "点数", initial: 25000 }
 */
export interface Variable {
  key: string;
  label: string;
  initial: number;
}

/**
 * @deprecated Use PermissionKey instead
 * 旧アクション定義（後方互換性のため残す）
 */
export interface Action {
  label: string;
  calc: string;
}

/**
 * 供託金状態
 * 各変数ごとの供託金を保持
 */
export interface PotState {
  [variableKey: string]: number;
}

/**
 * プレイヤー状態
 * 各プレイヤーの変数値とステータス
 */
export interface PlayerState {
  [key: string]: number | string | undefined;
  _status?: string;
}

/**
 * ゲームステートのスナップショット（履歴保存用）
 * history自体を除いた状態
 */
export interface GameStateSnapshot {
  __pot__?: PotState;
  [userId: string]: PlayerState | PotState | undefined;
}

/**
 * 履歴エントリ
 * 各操作の記録と、その時点のスナップショットを保持
 */
export interface HistoryEntry {
  id: string; // UUID
  timestamp: number; // Unix timestamp (ms)
  message: string; // ログ表示用 (例: "UserA → Pot: 1000")
  snapshot: GameStateSnapshot; // その時点のステート（操作前の状態）
}

/**
 * ゲーム状態（拡張版）
 * 全プレイヤーの現在の値を保持
 * 注意: "__pot__", "__history__"は予約キーとして使用
 */
export type GameState = {
  __pot__?: PotState; // 供託金エリア（予約キー）
  __history__?: HistoryEntry[]; // 履歴配列（時系列順）
} & {
  [userId: string]: PlayerState; // プレイヤー
};

/** プレイヤー接続状態（クライアントサイド管理、DBには保存しない） */
/**
 * 最近参加した部屋の履歴（AsyncStorage保存用）
 */
export interface RecentRoom {
  roomId: string;
  roomCode: string;
  joinedAt: number; // Date.now()
  templateName: string; // "麻雀" etc.
}

export interface ConnectionStatus {
  userId: string;
  isConnected: boolean;
  disconnectedAt: number | null; // Date.now() のタイムスタンプ
}

/**
 * プレイヤーの座席位置
 */
export type SeatPosition = "bottom" | "top" | "left" | "right";

/**
 * 座席配置マップ
 */
export interface SeatMap {
  [userId: string]: SeatPosition;
}

/**
 * スコア移動リクエスト
 */
export interface TransferScoreRequest {
  room_id: string;
  from_id: string; // "__pot__" または userId
  to_id: string; // "__pot__" または userId
  amount: number;
  variable?: string; // 移動する変数（デフォルトは "score"）
}

/**
 * Supabase Realtime のペイロード型
 */
export interface RealtimePayload<T = any> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: T;
  schema: string;
  table: string;
}

/**
 * ルーム作成リクエスト
 */
export interface CreateRoomRequest {
  template: GameTemplate;
  host_user_id: string;
}

/**
 * ルーム参加リクエスト
 */
export interface JoinRoomRequest {
  room_code: string;
  user_id: string;
}

/**
 * スコア更新リクエスト
 */
export interface UpdateScoreRequest {
  room_id: string;
  user_id: string;
  updates: Partial<PlayerState>;
}
