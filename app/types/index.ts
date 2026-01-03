// データモデル型定義 (docs/03_Data_Model.md に基づく)

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
  created_at: string;
}

/**
 * ユーザープロファイル (profiles テーブル)
 */
export interface Profile {
  id: string;
  display_name: string;
  current_room_id?: string;
}

/**
 * ゲームテンプレート定義
 * ゲームのルール（変数とアクション）を定義
 */
export interface GameTemplate {
  variables: Variable[];
  actions: Action[];
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
 * アクション定義
 * 例: { label: "リーチ", calc: "score - 1000" }
 */
export interface Action {
  label: string;
  calc: string;
}

/**
 * ゲーム状態
 * 全プレイヤーの現在の値を保持
 */
export interface GameState {
  [userId: string]: PlayerState;
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
