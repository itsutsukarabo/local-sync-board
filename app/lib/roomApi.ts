/**
 * ルーム管理API
 * Supabaseとのやり取りを行うルーム関連の関数
 */

import { supabase } from "./supabase";
import {
  Room,
  GameTemplate,
  CreateRoomRequest,
  JoinRoomRequest,
  GameStateSnapshot,
  SeatInfo,
  Settlement,
} from "../types";
import { generateRoomCode } from "../utils/roomUtils";

/** API呼び出しログ（roomApi経由の全操作を追跡） */
const apiLog = (fn: string, params?: Record<string, unknown>) => {
  const summary = params
    ? Object.entries(params)
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(" ")
    : "";
  console.log(`[API] ${fn}${summary ? " " + summary : ""}`);
};

/**
 * UUID生成（簡易版）
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * スナップショット復元時、着席中だが変数データがないプレイヤーに初期値を補完する
 */
function ensureSeatedPlayersHaveState(
  restoredState: GameStateSnapshot,
  seats: (SeatInfo | null)[],
  template: GameTemplate,
  currentState?: Record<string, any>
): GameStateSnapshot {
  const result = { ...restoredState };

  // 1. 着席中プレイヤーの補完（既存ロジック）
  for (const seat of seats) {
    if (seat?.userId && !result[seat.userId]) {
      const initialState: Record<string, number> = {};
      for (const v of template.variables) {
        initialState[v.key] = v.initial;
      }
      result[seat.userId] = initialState;
    }
  }

  // 2. 復元前に current_state にいたプレイヤーの補完（離席者のデータを保持）
  if (currentState) {
    for (const key of Object.keys(currentState)) {
      if (key.startsWith("__")) continue;
      if (!result[key]) {
        result[key] = currentState[key];
      }
    }
  }

  return result;
}

/**
 * 予約キーを除いたスナップショットを作成（ディープコピー）
 */
function createSnapshot(currentState: any): GameStateSnapshot {
  const { __history__, __writeId__, __settlements__, __recent_log__, ...rest } = currentState;
  // ディープコピーで参照を切る
  return JSON.parse(JSON.stringify(rest)) as GameStateSnapshot;
}

/** __recent_log__ に追加するエントリ（軽量: snapshot なし） */
interface RecentLogEntry {
  id: string;
  timestamp: number;
  message: string;
}

/** __recent_log__ のリングバッファ更新（最新5件を保持） */
const RECENT_LOG_MAX = 5;
function pushRecentLog(currentState: any, entry: RecentLogEntry): void {
  const log: RecentLogEntry[] = currentState.__recent_log__ || [];
  log.push(entry);
  if (log.length > RECENT_LOG_MAX) {
    currentState.__recent_log__ = log.slice(-RECENT_LOG_MAX);
  } else {
    currentState.__recent_log__ = log;
  }
}

/**
 * room_history テーブルに履歴を INSERT
 */
async function insertHistory(
  roomId: string,
  message: string,
  snapshot: GameStateSnapshot
): Promise<void> {
  const { error } = await supabase
    .from("room_history")
    .insert({ room_id: roomId, message, snapshot });
  if (error) {
    console.error("Error inserting history:", error);
  }
}

/**
 * 新しいルームを作成
 * @param template - ゲームテンプレート
 * @returns 作成されたルーム情報
 */
export async function createRoom(
  template: GameTemplate
): Promise<{ room: Room; error: Error | null }> {
  apiLog("createRoom", { layout: template.layoutMode });
  try {
    // 現在のユーザーを取得
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

    // ルームコードを生成（最大10回試行）
    let roomCode = generateRoomCode();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      // ルームコードの重複チェック
      const { data: existingRoom } = await supabase
        .from("rooms")
        .select("id")
        .eq("room_code", roomCode)
        .single();

      if (!existingRoom) {
        break; // 重複なし
      }

      roomCode = generateRoomCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error(
        "ルームコードの生成に失敗しました。もう一度お試しください。"
      );
    }

    // ルームを作成（ホストは自動参加しない）
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: user.id,
        status: "waiting",
        template: template,
        current_state: {}, // 空の状態で作成
        seats: [null, null, null, null], // 4つの空席で初期化
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("ルームの作成に失敗しました");
    }

    // プロファイルのcurrent_room_idを更新
    await supabase
      .from("profiles")
      .update({ current_room_id: data.id })
      .eq("id", user.id);

    return { room: data as Room, error: null };
  } catch (error) {
    console.error("Error creating room:", error);
    return {
      room: null as any,
      error:
        error instanceof Error
          ? error
          : new Error("ルームの作成に失敗しました"),
    };
  }
}

/**
 * ルームコードでルームを検索
 * @param roomCode - 検索するルームコード
 * @returns ルーム情報
 */
export async function findRoomByCode(
  roomCode: string
): Promise<{ room: Room | null; error: Error | null }> {
  apiLog("findRoomByCode", { roomCode });
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("room_code", roomCode)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // レコードが見つからない
        return { room: null, error: new Error("ルームが見つかりません") };
      }
      throw error;
    }

    return { room: data as Room, error: null };
  } catch (error) {
    console.error("Error finding room:", error);
    return {
      room: null,
      error:
        error instanceof Error
          ? error
          : new Error("ルームの検索に失敗しました"),
    };
  }
}

/**
 * ルームに参加
 * @param roomCode - 参加するルームコード
 * @returns ルーム情報
 */
export async function joinRoom(
  roomCode: string
): Promise<{ room: Room | null; error: Error | null }> {
  apiLog("joinRoom", { roomCode });
  try {
    // 現在のユーザーを取得
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

    // ルームを検索
    const { room, error: findError } = await findRoomByCode(roomCode);

    if (findError || !room) {
      return {
        room: null,
        error: findError || new Error("ルームが見つかりません"),
      };
    }

    // ルームが終了していないかチェック
    if (room.status === "finished") {
      return { room: null, error: new Error("このルームは既に終了しています") };
    }

    // 座席配列を初期化（存在しない場合）
    if (!room.seats) {
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ seats: [null, null, null, null] })
        .eq("id", room.id);

      if (updateError) {
        console.error("Error initializing seats:", updateError);
      }
      room.seats = [null, null, null, null];
    }

    // プロファイルのcurrent_room_idを更新
    await supabase
      .from("profiles")
      .update({ current_room_id: room.id })
      .eq("id", user.id);

    // 観戦モードで入室（座席には座らない）
    return { room: room as Room, error: null };
  } catch (error) {
    console.error("Error joining room:", error);
    return {
      room: null,
      error:
        error instanceof Error
          ? error
          : new Error("ルームへの参加に失敗しました"),
    };
  }
}

/**
 * ルームから退出
 * @param roomId - 退出するルームID
 */
export async function leaveRoom(
  roomId: string
): Promise<{ error: Error | null }> {
  apiLog("leaveRoom", { roomId });
  try {
    // 現在のユーザーを取得
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

    // プロファイルのcurrent_room_idをクリア
    await supabase
      .from("profiles")
      .update({ current_room_id: null })
      .eq("id", user.id);

    // ルームの状態からプレイヤーを削除
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const currentState = room.current_state || {};
    delete currentState[user.id];

    await supabase
      .from("rooms")
      .update({ current_state: currentState })
      .eq("id", roomId);

    return { error: null };
  } catch (error) {
    console.error("Error leaving room:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("ルームからの退出に失敗しました"),
    };
  }
}

/**
 * ルームを削除（ホストのみ）
 * @param roomId - 削除するルームID
 */
export async function deleteRoom(
  roomId: string
): Promise<{ error: Error | null }> {
  apiLog("deleteRoom", { roomId });
  try {
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);

    if (error) {
      throw error;
    }

    return { error: null };
  } catch (error) {
    console.error("Error deleting room:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("ルームの削除に失敗しました"),
    };
  }
}

/**
 * ルームのステータスを更新
 * @param roomId - ルームID
 * @param status - 新しいステータス
 */
export async function updateRoomStatus(
  roomId: string,
  status: "waiting" | "playing" | "finished"
): Promise<{ error: Error | null }> {
  apiLog("updateRoomStatus", { roomId, status });
  try {
    const { error } = await supabase
      .from("rooms")
      .update({ status })
      .eq("id", roomId);

    if (error) {
      throw error;
    }

    return { error: null };
  } catch (error) {
    console.error("Error updating room status:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("ルームステータスの更新に失敗しました"),
    };
  }
}

/**
 * スコアを移動（トランザクション更新 + 履歴保存）
 * 複数変数を一括で移動可能
 * @param roomId - ルームID
 * @param fromId - 送信元ID（"__pot__" またはユーザーID）
 * @param toId - 送信先ID（"__pot__" またはユーザーID）
 * @param transfers - 移動する変数と金額の配列
 * @param fromName - 送信元の表示名（履歴用、省略時はID）
 * @param toName - 送信先の表示名（履歴用、省略時はID）
 */
export async function transferScore(
  roomId: string,
  fromId: string,
  toId: string,
  transfers: { variable: string; amount: number }[],
  fromName?: string,
  toName?: string
): Promise<{ error: Error | null }> {
  apiLog("transferScore", { from: fromName ?? fromId, to: toName ?? toId, transfers });
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 1. 最新の current_state とテンプレートを取得（重要！通信ラグ対策）
      const { data: room, error: fetchError } = await supabase
        .from("rooms")
        .select("current_state, template")
        .eq("id", roomId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      if (!room) {
        throw new Error("ルームが見つかりません");
      }

      // 2. 操作前のスナップショットを作成（履歴用）
      const beforeSnapshot = createSnapshot(room.current_state);

      // 3. 最新データを元に計算（全transferを一括処理）
      const currentState = { ...room.current_state };

      for (const { variable, amount } of transfers) {
        // Potからの移動
        if (fromId === "__pot__") {
          if (
            !currentState.__pot__ ||
            (currentState.__pot__[variable] || 0) < amount
          ) {
            throw new Error("供託金が不足しています");
          }
          currentState.__pot__[variable] -= amount;

          if (!currentState[toId]) {
            throw new Error("送信先プレイヤーが見つかりません");
          }
          currentState[toId][variable] =
            ((currentState[toId][variable] as number) || 0) + amount;
        }
        // Potへの移動
        else if (toId === "__pot__") {
          if (!currentState[fromId]) {
            throw new Error("送信元プレイヤーが見つかりません");
          }
          const fromValue = (currentState[fromId][variable] as number) || 0;

          currentState[fromId][variable] = fromValue - amount;

          if (!currentState.__pot__) {
            currentState.__pot__ = {};
          }
          currentState.__pot__[variable] =
            (currentState.__pot__[variable] || 0) + amount;
        }
        // プレイヤー間の移動
        else {
          if (!currentState[fromId] || !currentState[toId]) {
            throw new Error("プレイヤーが見つかりません");
          }

          const fromValue = (currentState[fromId][variable] as number) || 0;

          currentState[fromId][variable] = fromValue - amount;
          currentState[toId][variable] =
            ((currentState[toId][variable] as number) || 0) + amount;
        }
      }

      // 4. 履歴エントリを作成
      const displayFromName =
        fromName || (fromId === "__pot__" ? "供託回収" : fromId.substring(0, 8));
      const displayToName =
        toName || (toId === "__pot__" ? "供託" : toId.substring(0, 8));

      // 変数ごとの移動内容をまとめてメッセージ化
      const transferDetails = transfers
        .map(({ variable, amount }) => {
          const variableLabel =
            room.template?.variables?.find(
              (v: { key: string; label: string }) => v.key === variable
            )?.label || variable;
          return `${variableLabel} ${amount.toLocaleString()}`;
        })
        .join(", ");

      const historyMessage = `${displayFromName} → ${displayToName}: ${transferDetails}`;
      const entryId = generateUUID();

      // 5. __recent_log__ を更新（軽量プレビュー用）
      pushRecentLog(currentState, { id: entryId, timestamp: Date.now(), message: historyMessage });

      // 6. 一意の書き込みIDを付与（CAS検証用）
      const writeId = generateUUID();
      currentState.__writeId__ = writeId;

      // 7. Supabaseに保存
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ current_state: currentState })
        .eq("id", roomId);

      if (updateError) {
        throw updateError;
      }

      // 8. 書き込み後検証
      const { data: verify } = await supabase
        .from("rooms")
        .select("current_state")
        .eq("id", roomId)
        .single();
      if (verify?.current_state?.__writeId__ === writeId) {
        // 成功確定 → 履歴を別テーブルに保存（非同期、失敗しても操作自体は成功）
        await insertHistory(roomId, historyMessage, beforeSnapshot);
        return { error: null };
      }
      // 別クライアントに上書きされた → 最新stateを再取得してリトライ
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
        continue;
      }
      // 最終リトライでも競合が解消されなかった → エラーを返す
      return { error: new Error("書き込み競合が解消されませんでした。再度お試しください。") };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error("Error transferring score:", error);
        return {
          error:
            error instanceof Error
              ? error
              : new Error("スコアの移動に失敗しました"),
        };
      }
      await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
    }
  }
  return { error: new Error("スコアの移動に失敗しました") };
}

/**
 * ゲームに参加（リストモード用）
 * current_stateにプレイヤーを追加
 * @param roomId - ルームID
 * @returns 更新されたルーム情報
 */
export async function joinGame(
  roomId: string
): Promise<{ room: Room | null; error: Error | null }> {
  apiLog("joinGame", { roomId });
  try {
    // 現在のユーザーを取得
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

    // 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // ルームが終了していないかチェック
    if (room.status === "finished") {
      throw new Error("このルームは既に終了しています");
    }

    // 既にゲームに参加しているかチェック
    const currentState = room.current_state || {};
    if (currentState[user.id]) {
      throw new Error("既にゲームに参加しています");
    }

    // テンプレートから初期値を設定してプレイヤーを追加
    const initialState: Record<string, number> = {};
    room.template.variables.forEach((variable: any) => {
      initialState[variable.key] = variable.initial;
    });
    currentState[user.id] = initialState;

    // ルームの状態を更新
    const { data: updateData, error: updateError } = await supabase
      .from("rooms")
      .update({ current_state: currentState })
      .eq("id", roomId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // プロファイルのcurrent_room_idを更新
    await supabase
      .from("profiles")
      .update({ current_room_id: roomId })
      .eq("id", user.id);

    return { room: updateData as Room, error: null };
  } catch (error) {
    console.error("Error joining game:", error);
    return {
      room: null,
      error:
        error instanceof Error
          ? error
          : new Error("ゲームへの参加に失敗しました"),
    };
  }
}

/**
 * 座席に着席
 * @param roomId - ルームID
 * @param seatIndex - 座席インデックス (0: Bottom, 1: Right, 2: Top, 3: Left)
 * @returns 更新されたルーム情報
 */
export async function joinSeat(
  roomId: string,
  seatIndex: number
): Promise<{ room: Room | null; error: Error | null }> {
  apiLog("joinSeat", { roomId, seatIndex });
  try {
    // 現在のユーザーを取得
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

    // プロファイルからdisplay_nameを取得
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    const displayName = profile?.display_name || undefined;

    // 座席インデックスの検証
    if (seatIndex < 0 || seatIndex > 3) {
      throw new Error("無効な座席インデックスです");
    }

    // 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // 座席配列を取得（存在しない場合は初期化）
    const seats = room.seats || [null, null, null, null];

    // 既に座席に座っているかチェック
    const currentSeatIndex = seats.findIndex(
      (seat: any) => seat && seat.userId === user.id
    );
    if (currentSeatIndex !== -1) {
      throw new Error("既に座席に着席しています");
    }

    // 指定された座席が空いているかチェック
    if (seats[seatIndex] !== null) {
      throw new Error("この座席は既に使用されています");
    }

    // 座席に着席
    seats[seatIndex] = {
      userId: user.id,
      status: "active",
      displayName,
    };

    // テンプレートから初期値を設定
    const currentState = room.current_state || {};
    if (!currentState[user.id]) {
      const initialState: Record<string, number> = {};
      room.template.variables.forEach((variable: any) => {
        initialState[variable.key] = variable.initial;
      });
      currentState[user.id] = initialState;
    }
    // displayNameを保存（離席後も名前を表示するため）
    currentState[user.id].__displayName__ = displayName;

    // ルームの状態を更新
    const { data: updateData, error: updateError } = await supabase
      .from("rooms")
      .update({
        seats: seats,
        current_state: currentState,
      })
      .eq("id", roomId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // プロファイルのcurrent_room_idを更新
    await supabase
      .from("profiles")
      .update({ current_room_id: roomId })
      .eq("id", user.id);

    return { room: updateData as Room, error: null };
  } catch (error) {
    console.error("Error joining seat:", error);
    return {
      room: null,
      error:
        error instanceof Error
          ? error
          : new Error("座席への着席に失敗しました"),
    };
  }
}

/**
 * 座席から退席
 * @param roomId - ルームID
 * @returns 更新されたルーム情報
 */
export async function leaveSeat(
  roomId: string
): Promise<{ room: Room | null; error: Error | null }> {
  apiLog("leaveSeat", { roomId });
  try {
    // 現在のユーザーを取得
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

    // 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // 座席配列を取得
    const seats = room.seats || [null, null, null, null];

    // 現在の座席を見つける
    const currentSeatIndex = seats.findIndex(
      (seat: any) => seat && seat.userId === user.id
    );

    if (currentSeatIndex === -1) {
      throw new Error("座席に着席していません");
    }

    // 座席から退席
    seats[currentSeatIndex] = null;

    // ルームの状態を更新
    const { data: updateData, error: updateError } = await supabase
      .from("rooms")
      .update({ seats: seats })
      .eq("id", roomId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return { room: updateData as Room, error: null };
  } catch (error) {
    console.error("Error leaving seat:", error);
    return {
      room: null,
      error:
        error instanceof Error
          ? error
          : new Error("座席からの退席に失敗しました"),
    };
  }
}

/**
 * 指定した履歴IDの時点にロールバック
 * @param roomId - ルームID
 * @param historyId - ロールバック先の履歴ID
 * @returns エラー情報
 */
export async function rollbackTo(
  roomId: string,
  historyId: string
): Promise<{ error: Error | null }> {
  apiLog("rollbackTo", { roomId, historyId });
  try {
    // 1. 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("current_state, template, seats")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // 2. room_history テーブルから対象エントリを取得
    const { data: targetEntry, error: histError } = await supabase
      .from("room_history")
      .select("*")
      .eq("id", historyId)
      .eq("room_id", roomId)
      .single();

    if (histError || !targetEntry) {
      throw new Error("指定された履歴が見つかりません");
    }

    const currentState = room.current_state;

    // 3. 見つかった要素のsnapshotを展開
    const restoredState = ensureSeatedPlayersHaveState(
      { ...targetEntry.snapshot },
      room.seats ?? [],
      room.template,
      currentState
    );

    // 4. ロールバック前の状態を履歴に保存
    const rollbackMessage = `ロールバック (${new Date(targetEntry.created_at).toLocaleTimeString("ja-JP")})`;
    const beforeSnapshot = createSnapshot(currentState);

    // 5. 対象エントリより新しい履歴を削除
    await supabase
      .from("room_history")
      .delete()
      .eq("room_id", roomId)
      .gte("created_at", targetEntry.created_at);

    // 6. ロールバック操作自体を履歴に追加
    await insertHistory(roomId, rollbackMessage, beforeSnapshot);

    // 7. 新しいcurrent_stateを構築（__recent_log__ を更新）
    const newState = { ...restoredState };
    pushRecentLog(newState, { id: generateUUID(), timestamp: Date.now(), message: rollbackMessage });

    // 8. Supabaseに保存
    const { error: updateError } = await supabase
      .from("rooms")
      .update({ current_state: newState })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    return { error: null };
  } catch (error) {
    console.error("Error rolling back:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("ロールバックに失敗しました"),
    };
  }
}

/**
 * テンプレートを更新（変数追加、初期値変更、Pot操作編集）
 * 新しい変数が追加された場合、既存プレイヤーにもその変数を初期値で追加する
 * @param roomId - ルームID
 * @param templateUpdate - 更新するテンプレートの部分データ
 */
export async function updateTemplate(
  roomId: string,
  templateUpdate: Partial<GameTemplate>
): Promise<{ error: Error | null }> {
  apiLog("updateTemplate", { roomId });
  try {
    // 1. 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // 2. テンプレートをマージ
    const newTemplate = { ...room.template, ...templateUpdate };

    // 3. 新しい変数が追加された場合、既存プレイヤーにその変数を初期値で追加
    const currentState = { ...room.current_state };
    if (templateUpdate.variables) {
      const playerIds = Object.keys(currentState).filter(
        (key) => !key.startsWith("__")
      );
      for (const playerId of playerIds) {
        for (const variable of templateUpdate.variables) {
          if (currentState[playerId][variable.key] === undefined) {
            currentState[playerId][variable.key] = variable.initial;
          }
        }
      }

      // 既存変数の initial 差分スライド（現在のプレイヤーのみ。履歴スナップショットは別テーブルなので不変）
      const oldVariables = room.template.variables || [];
      for (const newVar of templateUpdate.variables) {
        const oldVar = oldVariables.find((v: any) => v.key === newVar.key);
        if (!oldVar) continue;

        const diff = newVar.initial - oldVar.initial;
        if (diff === 0) continue;

        for (const playerId of playerIds) {
          if (currentState[playerId][newVar.key] !== undefined) {
            currentState[playerId][newVar.key] += diff;
          }
        }
      }
    }

    // 4. Supabaseに保存
    const { error: updateError } = await supabase
      .from("rooms")
      .update({
        template: newTemplate,
        current_state: currentState,
      })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    return { error: null };
  } catch (error) {
    console.error("Error updating template:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("テンプレートの更新に失敗しました"),
    };
  }
}

/**
 * プレイヤーのスコアを強制編集（ホスト用）
 * @param roomId - ルームID
 * @param playerId - 対象プレイヤーのID
 * @param updates - 上書きする変数と値のマップ
 * @param displayName - 履歴に表示するプレイヤー名
 */
export async function forceEditScore(
  roomId: string,
  playerId: string,
  updates: Record<string, number>,
  displayName?: string
): Promise<{ error: Error | null }> {
  apiLog("forceEditScore", { roomId, player: displayName ?? playerId, updates });
  try {
    // 1. 最新の current_state とテンプレートを取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("current_state, template")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    const currentState = { ...room.current_state };

    if (!currentState[playerId]) {
      throw new Error("プレイヤーが見つかりません");
    }

    // 2. 操作前のスナップショットを作成
    const beforeSnapshot = createSnapshot(currentState);

    // 3. 値を上書き
    for (const [key, value] of Object.entries(updates)) {
      currentState[playerId][key] = value;
    }

    // 4. 履歴メッセージを作成
    const details = Object.entries(updates)
      .map(([key, value]) => {
        const label =
          room.template?.variables?.find(
            (v: { key: string; label: string }) => v.key === key
          )?.label || key;
        return `${label}: ${value.toLocaleString()}`;
      })
      .join(", ");

    const historyMessage = `強制編集: ${displayName || playerId.substring(0, 8)} - ${details}`;

    // 5. __recent_log__ を更新して保存
    pushRecentLog(currentState, { id: generateUUID(), timestamp: Date.now(), message: historyMessage });

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ current_state: currentState })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    // 6. 履歴を別テーブルに保存
    await insertHistory(roomId, historyMessage, beforeSnapshot);

    return { error: null };
  } catch (error) {
    console.error("Error force editing score:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("スコアの強制編集に失敗しました"),
    };
  }
}

/**
 * 選択した変数を全プレイヤーで初期値にリセット（供託金も含む）
 * @param roomId - ルームID
 * @param variableKeys - リセット対象の変数キー配列
 */
export async function resetScores(
  roomId: string,
  variableKeys: string[]
): Promise<{ error: Error | null }> {
  apiLog("resetScores", { roomId, variableKeys });
  try {
    // 1. 最新の current_state とテンプレートを取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("current_state, template")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    const currentState = { ...room.current_state };

    // 2. 操作前のスナップショットを作成
    const beforeSnapshot = createSnapshot(currentState);

    // 3. 全プレイヤーの選択変数を initial に上書き
    const playerIds = Object.keys(currentState).filter(
      (key) => !key.startsWith("__")
    );
    for (const playerId of playerIds) {
      for (const varKey of variableKeys) {
        const variable = room.template?.variables?.find(
          (v: { key: string }) => v.key === varKey
        );
        if (variable) {
          currentState[playerId][varKey] = variable.initial;
        }
      }
    }

    // 4. __pot__ の選択変数を 0 にリセット
    if (currentState.__pot__) {
      for (const varKey of variableKeys) {
        if (currentState.__pot__[varKey] !== undefined) {
          currentState.__pot__[varKey] = 0;
        }
      }
    }

    // 5. 履歴メッセージを作成
    const labels = variableKeys
      .map((key) => {
        const variable = room.template?.variables?.find(
          (v: { key: string; label: string }) => v.key === key
        );
        return variable?.label || key;
      })
      .join(", ");

    const historyMessage = `リセット: ${labels}`;

    // 6. __recent_log__ を更新して保存
    pushRecentLog(currentState, { id: generateUUID(), timestamp: Date.now(), message: historyMessage });

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ current_state: currentState })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    // 7. 履歴を別テーブルに保存
    await insertHistory(roomId, historyMessage, beforeSnapshot);

    return { error: null };
  } catch (error) {
    console.error("Error resetting scores:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("スコアのリセットに失敗しました"),
    };
  }
}

/**
 * 直前の操作を取り消す（Undo）
 * @param roomId - ルームID
 * @returns エラー情報
 */
export async function undoLast(
  roomId: string
): Promise<{ error: Error | null }> {
  apiLog("undoLast", { roomId });
  try {
    // 1. 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("current_state, template, seats")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // 2. room_history から最新エントリを取得
    const { data: lastEntry, error: histError } = await supabase
      .from("room_history")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (histError || !lastEntry) {
      throw new Error("取り消せる操作がありません");
    }

    const currentState = room.current_state;

    // 3. 最後のエントリのsnapshotを復元（着席中プレイヤー・離席者の変数データを補完）
    const restoredState = ensureSeatedPlayersHaveState(
      { ...lastEntry.snapshot },
      room.seats ?? [],
      room.template,
      currentState
    );

    // 4. room_history から最後のエントリを削除
    await supabase
      .from("room_history")
      .delete()
      .eq("id", lastEntry.id);

    // 5. 新しいcurrent_stateを構築（__recent_log__ を更新）
    const newState = { ...restoredState };
    // 直前のrecentLogからundoした操作を除去（あれば）
    const recentLog = currentState.__recent_log__ || [];
    newState.__recent_log__ = recentLog.filter(
      (entry: any) => entry.message !== lastEntry.message
    );

    // 6. Supabaseに保存
    const { error: updateError } = await supabase
      .from("rooms")
      .update({ current_state: newState })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    return { error: null };
  } catch (error) {
    console.error("Error undoing:", error);
    return {
      error:
        error instanceof Error ? error : new Error("取り消しに失敗しました"),
    };
  }
}

/**
 * 指定ユーザーを座席から強制離席（タイムアウト用）
 * 冪等: 既に離席済みならno-op
 * @param roomId - ルームID
 * @param targetUserId - 強制離席させるユーザーID
 */
export async function forceLeaveSeat(
  roomId: string,
  targetUserId: string
): Promise<{ error: Error | null }> {
  apiLog("forceLeaveSeat", { roomId, targetUserId });
  try {
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("seats")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    const seats: (SeatInfo | null)[] = room.seats || [null, null, null, null];
    const seatIndex = seats.findIndex(
      (seat) => seat && seat.userId === targetUserId
    );

    // 既に離席済みなら正常終了（冪等）
    if (seatIndex === -1) {
      return { error: null };
    }

    seats[seatIndex] = null;

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ seats })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    return { error: null };
  } catch (error) {
    console.error("Error force leaving seat:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("強制離席に失敗しました"),
    };
  }
}

/**
 * 架空ユーザーを座席に着席させる（ホスト専用）
 * @param roomId - ルームID
 * @param seatIndex - 座席インデックス (0-3)
 */
export async function joinFakeSeat(
  roomId: string,
  seatIndex: number
): Promise<{ error: Error | null }> {
  apiLog("joinFakeSeat", { roomId, seatIndex });
  try {
    // 1. 現在のユーザーを取得（ホスト確認用）
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

    // 2. 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // 3. ホスト確認
    if (room.host_user_id !== user.id) {
      throw new Error("ホストのみが架空ユーザーを作成できます");
    }

    // 4. 座席インデックスの検証
    if (seatIndex < 0 || seatIndex > 3) {
      throw new Error("無効な座席インデックスです");
    }

    // 5. 対象座席が空であることを確認
    const seats = room.seats || [null, null, null, null];
    if (seats[seatIndex] !== null) {
      throw new Error("この座席は既に使用されています");
    }

    // 6. 架空ユーザーIDと表示名を生成（IDは一意にする）
    const fakeUserId = `fake_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 使用中の名前を収集（seats + current_stateに残っているゲストの__displayName__）
    const usedNames = new Set<string>();
    for (const s of seats) {
      if (s && s.displayName) usedNames.add(s.displayName);
    }
    const existingState = room.current_state || {};
    for (const key of Object.keys(existingState)) {
      if (key.startsWith("fake_") && existingState[key]?.__displayName__) {
        usedNames.add(existingState[key].__displayName__);
      }
    }

    const nameLetters = ["A", "B", "C", "D", "E", "F", "G", "H"];
    let displayName = "プレイヤーA";
    for (const letter of nameLetters) {
      const candidate = `プレイヤー${letter}`;
      if (!usedNames.has(candidate)) {
        displayName = candidate;
        break;
      }
    }

    // 7. 座席に着席
    seats[seatIndex] = {
      userId: fakeUserId,
      status: "active",
      displayName,
      isFake: true,
    };

    // 8. current_stateに初期値を追加
    const currentState = room.current_state || {};
    if (!currentState[fakeUserId]) {
      const initialState: Record<string, any> = {};
      room.template.variables.forEach((variable: any) => {
        initialState[variable.key] = variable.initial;
      });
      initialState.__displayName__ = displayName;
      currentState[fakeUserId] = initialState;
    } else {
      // 既存エントリがある場合もdisplayNameを更新
      currentState[fakeUserId].__displayName__ = displayName;
    }

    // 9. 一括DB更新
    const { error: updateError } = await supabase
      .from("rooms")
      .update({
        seats,
        current_state: currentState,
      })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    return { error: null };
  } catch (error) {
    console.error("Error joining fake seat:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("架空ユーザーの作成に失敗しました"),
    };
  }
}

/**
 * 架空ユーザーを座席から離席させ、current_stateからも削除（ホスト専用）
 * @param roomId - ルームID
 * @param fakeUserId - 架空ユーザーID（例: "fake_0"）
 */
export async function removeFakePlayer(
  roomId: string,
  fakeUserId: string
): Promise<{ error: Error | null }> {
  apiLog("removeFakePlayer", { roomId, fakeUserId });
  try {
    // 1. 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("seats, current_state")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // 2. 座席からfakeUserIdを除去
    const seats: (SeatInfo | null)[] = room.seats || [null, null, null, null];
    const seatIndex = seats.findIndex(
      (seat) => seat && seat.userId === fakeUserId
    );
    if (seatIndex !== -1) {
      seats[seatIndex] = null;
    }

    // 3. current_stateからエントリを削除
    const currentState = { ...room.current_state };
    delete currentState[fakeUserId];

    // 4. 一括DB更新
    const { error: updateError } = await supabase
      .from("rooms")
      .update({ seats, current_state: currentState })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    return { error: null };
  } catch (error) {
    console.error("Error removing fake player:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("架空ユーザーの削除に失敗しました"),
    };
  }
}

/**
 * 離席済みゲストを指定座席に再着席させる（ホスト専用）
 * @param roomId - ルームID
 * @param fakeUserId - 再着席させるゲストのID（例: "fake_0"）
 * @param seatIndex - 座席インデックス (0-3)
 */
export async function reseatFakePlayer(
  roomId: string,
  fakeUserId: string,
  seatIndex: number
): Promise<{ error: Error | null }> {
  apiLog("reseatFakePlayer", { roomId, fakeUserId, seatIndex });
  try {
    // 1. 最新のルーム情報を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("seats, current_state")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    // 2. 座席が空であることを確認
    const seats: (SeatInfo | null)[] = room.seats || [null, null, null, null];
    if (seats[seatIndex] !== null) {
      throw new Error("この座席は既に使用されています");
    }

    // 3. current_stateにゲストが存在することを確認
    if (!room.current_state[fakeUserId]) {
      throw new Error("指定されたゲストが見つかりません");
    }

    // 4. current_stateから保存済みのdisplayNameを取得
    const displayName = room.current_state[fakeUserId].__displayName__ || fakeUserId;

    // 5. 座席に着席
    seats[seatIndex] = {
      userId: fakeUserId,
      status: "active",
      displayName,
      isFake: true,
    };

    // 6. 一括DB更新（current_stateは変更なし）
    const { error: updateError } = await supabase
      .from("rooms")
      .update({ seats })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    return { error: null };
  } catch (error) {
    console.error("Error reseating fake player:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("ゲストの再着席に失敗しました"),
    };
  }
}

/**
 * 精算結果を保存し、スコアを初期値にリセット
 * @param roomId - ルームID
 * @param settlement - 精算結果オブジェクト
 */
export async function saveSettlement(
  roomId: string,
  settlement: Settlement
): Promise<{ error: Error | null }> {
  apiLog("saveSettlement", { roomId });
  try {
    // 1. 最新の current_state とテンプレートを取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("current_state, template")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    const currentState = { ...room.current_state };

    // 2. 操作前のスナップショットを作成（履歴用）
    const beforeSnapshot = createSnapshot(currentState);

    // 3. score変数を初期値にリセット（他の変数はそのまま）
    const scoreVar = room.template?.variables?.find(
      (v: { key: string }) => v.key === "score"
    );
    if (scoreVar) {
      const playerIds = Object.keys(currentState).filter(
        (key) => !key.startsWith("__")
      );
      for (const playerId of playerIds) {
        if (currentState[playerId]) {
          currentState[playerId].score = scoreVar.initial;
        }
      }
    }

    // 供託金のscoreもリセット
    if (currentState.__pot__?.score !== undefined) {
      currentState.__pot__.score = 0;
    }

    // 4. 履歴メッセージを作成（精算結果サマリ）
    const resultSummary = Object.values(settlement.playerResults)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => `${r.displayName}: ${r.result >= 0 ? "+" : ""}${r.result}`)
      .join(", ");

    const historyMessage = `精算: ${resultSummary}`;

    // 5. __recent_log__ を更新して保存
    pushRecentLog(currentState, { id: generateUUID(), timestamp: Date.now(), message: historyMessage });

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ current_state: currentState })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    // 6. 精算を別テーブルに保存
    await supabase
      .from("room_settlements")
      .insert({
        id: settlement.id,
        room_id: roomId,
        type: settlement.type,
        player_results: settlement.playerResults,
      });

    // 7. 履歴を別テーブルに保存
    await insertHistory(roomId, historyMessage, beforeSnapshot);

    return { error: null };
  } catch (error) {
    console.error("Error saving settlement:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("精算の保存に失敗しました"),
    };
  }
}

/**
 * 調整行を保存（スコアリセット・供託リセットなし）
 * @param roomId - ルームID
 * @param settlement - 調整結果オブジェクト (type="adjustment")
 */
export async function saveAdjustment(
  roomId: string,
  settlement: Settlement
): Promise<{ error: Error | null }> {
  apiLog("saveAdjustment", { roomId });
  try {
    // 1. 最新の current_state を取得
    const { data: room, error: fetchError } = await supabase
      .from("rooms")
      .select("current_state")
      .eq("id", roomId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!room) {
      throw new Error("ルームが見つかりません");
    }

    const currentState = { ...room.current_state };

    // 2. 操作前のスナップショットを作成（履歴用）
    const beforeSnapshot = createSnapshot(currentState);

    // 3. 履歴メッセージを作成（調整サマリ）
    const resultSummary = Object.values(settlement.playerResults)
      .filter((r) => r.result !== 0)
      .map((r) => `${r.displayName}: ${r.result >= 0 ? "+" : ""}${r.result.toFixed(1)}`)
      .join(", ");

    const historyMessage = `調整: ${resultSummary}`;

    // 4. __recent_log__ を更新して保存（current_state の変更は不要、精算は別テーブル）
    pushRecentLog(currentState, { id: generateUUID(), timestamp: Date.now(), message: historyMessage });

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ current_state: currentState })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    // 5. 精算を別テーブルに保存
    await supabase
      .from("room_settlements")
      .insert({
        id: settlement.id,
        room_id: roomId,
        type: settlement.type,
        player_results: settlement.playerResults,
      });

    // 6. 履歴を別テーブルに保存
    await insertHistory(roomId, historyMessage, beforeSnapshot);

    return { error: null };
  } catch (error) {
    console.error("Error saving adjustment:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("調整の保存に失敗しました"),
    };
  }
}

// ============================================
// 履歴・精算の読み取り API（ページネーション対応）
// ============================================

/** room_history テーブルのエントリ型 */
export interface RoomHistoryEntry {
  id: string;
  room_id: string;
  message: string;
  snapshot: GameStateSnapshot;
  created_at: string;
}

/**
 * 操作履歴をページネーション取得（新しい順）
 * @param roomId - ルームID
 * @param cursor - 前回取得した最後のエントリの created_at（ISO文字列）。初回は省略
 * @param limit - 取得件数（デフォルト10）
 * @returns エントリ配列と次ページ有無
 */
export async function fetchHistory(
  roomId: string,
  cursor?: string,
  limit: number = 10
): Promise<{ entries: RoomHistoryEntry[]; hasMore: boolean; error: Error | null }> {
  apiLog("fetchHistory", { roomId, cursor, limit });
  try {
    let query = supabase
      .from("room_history")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // 次ページ存在判定用に+1

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const entries = (data || []) as RoomHistoryEntry[];
    const hasMore = entries.length > limit;
    if (hasMore) {
      entries.pop(); // +1 分を除去
    }

    return { entries, hasMore, error: null };
  } catch (error) {
    console.error("Error fetching history:", error);
    return {
      entries: [],
      hasMore: false,
      error: error instanceof Error ? error : new Error("履歴の取得に失敗しました"),
    };
  }
}

/**
 * 精算履歴を全件取得（作成日時の昇順）
 * @param roomId - ルームID
 */
export async function fetchSettlements(
  roomId: string
): Promise<{ settlements: Settlement[]; error: Error | null }> {
  apiLog("fetchSettlements", { roomId });
  try {
    const { data, error } = await supabase
      .from("room_settlements")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    // DB 行を Settlement 型に変換
    const settlements: Settlement[] = (data || []).map((row: any) => ({
      id: row.id,
      timestamp: new Date(row.created_at).getTime(),
      type: row.type as "settlement" | "adjustment",
      playerResults: row.player_results,
    }));

    return { settlements, error: null };
  } catch (error) {
    console.error("Error fetching settlements:", error);
    return {
      settlements: [],
      error: error instanceof Error ? error : new Error("精算履歴の取得に失敗しました"),
    };
  }
}
