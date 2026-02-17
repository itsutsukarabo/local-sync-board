import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ローカル Supabase のデフォルト認証情報 (supabase start で出力される固定値)
const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** service_role 権限の Supabase クライアント（RLS バイパス） */
export function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** テスト用ユーザーを auth.users に作成し、user_id を返す */
export async function createTestUser(
  supabase: SupabaseClient,
  email = `test-${crypto.randomUUID()}@example.com`
): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw new Error(`createTestUser failed: ${error.message}`);
  return data.user.id;
}

/** テスト用ルームを作成し、room id を返す */
export async function createTestRoom(
  supabase: SupabaseClient,
  hostUserId: string,
  opts: {
    currentState: Record<string, unknown>;
    template?: Record<string, unknown>;
    roomCode?: string;
    status?: string;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      host_user_id: hostUserId,
      room_code: opts.roomCode ?? generateRoomCode(),
      status: opts.status ?? "playing",
      template: opts.template ?? DEFAULT_TEMPLATE,
      current_state: opts.currentState,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createTestRoom failed: ${error.message}`);
  return data.id;
}

/** ルームとカスケード先（room_history, room_settlements）を削除 */
export async function deleteTestRoom(
  supabase: SupabaseClient,
  roomId: string
): Promise<void> {
  await supabase.from("rooms").delete().eq("id", roomId);
}

/** テストユーザーを auth.users から削除 */
export async function deleteTestUser(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase.auth.admin.deleteUser(userId);
}

/** ルームの current_state を取得 */
export async function getRoomState(
  supabase: SupabaseClient,
  roomId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("rooms")
    .select("current_state")
    .eq("id", roomId)
    .single();
  if (error) throw new Error(`getRoomState failed: ${error.message}`);
  return data.current_state as Record<string, unknown>;
}

/** room_history を取得（新しい順） */
export async function getRoomHistory(
  supabase: SupabaseClient,
  roomId: string
): Promise<Array<{ id: string; message: string; snapshot: unknown }>> {
  const { data, error } = await supabase
    .from("room_history")
    .select("id, message, snapshot")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getRoomHistory failed: ${error.message}`);
  return data;
}

/** room_settlements を取得（新しい順） */
export async function getSettlements(
  supabase: SupabaseClient,
  roomId: string
): Promise<
  Array<{
    id: string;
    type: string;
    player_results: unknown;
    created_at: string;
  }>
> {
  const { data, error } = await supabase
    .from("room_settlements")
    .select("id, type, player_results, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getSettlements failed: ${error.message}`);
  return data;
}

/** テスト用ルームを seats 付きで作成し room id を返す */
export async function createTestRoomWithSeats(
  supabase: SupabaseClient,
  hostUserId: string,
  opts: {
    currentState: Record<string, unknown>;
    seats: unknown[];
    template?: Record<string, unknown>;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      host_user_id: hostUserId,
      room_code: generateRoomCode(),
      status: "playing",
      template: opts.template ?? DEFAULT_TEMPLATE,
      current_state: opts.currentState,
      seats: opts.seats,
    })
    .select("id")
    .single();
  if (error)
    throw new Error(`createTestRoomWithSeats failed: ${error.message}`);
  return data.id;
}

// ---- 認証済みクライアント（RLS テスト用） ----

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export interface AnonUser {
  /** anon key + 匿名ログイン済みクライアント（RLS が適用される） */
  client: SupabaseClient;
  userId: string;
}

/**
 * 匿名ユーザーとしてログインした Supabase クライアントを生成する。
 * アプリの `signInAnonymously()` と同等の認証フロー。
 * handle_new_user トリガーにより profiles レコードも自動作成される。
 */
export async function createAnonUser(): Promise<AnonUser> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`signInAnonymously failed: ${error.message}`);
  return { client, userId: data.user!.id };
}

/** 匿名ユーザーをクリーンアップ（service_role で削除） */
export async function cleanupAnonUser(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  await admin.auth.admin.deleteUser(userId);
}

// ---- 内部ユーティリティ ----

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** 麻雀風テンプレート（テストデフォルト） */
export const DEFAULT_TEMPLATE = {
  variables: [
    { key: "score", label: "点数", initial: 25000 },
    { key: "riichi", label: "リーチ棒", initial: 0 },
  ],
  actions: [],
};

/** 2プレイヤーの初期 current_state を生成 */
export function makePlayerState(
  players: Array<{
    id: string;
    score?: number;
    riichi?: number;
    displayName?: string;
  }>,
  pot?: { score?: number; riichi?: number }
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const p of players) {
    state[p.id] = {
      score: p.score ?? 25000,
      riichi: p.riichi ?? 0,
      ...(p.displayName ? { __displayName__: p.displayName } : {}),
    };
  }
  if (pot) {
    state.__pot__ = pot;
  }
  return state;
}
