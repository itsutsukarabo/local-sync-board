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
  HistoryEntry,
  GameStateSnapshot,
} from "../types";
import { generateRoomCode } from "../utils/roomUtils";

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
 * 履歴を除いたスナップショットを作成（ディープコピー）
 */
function createSnapshot(currentState: any): GameStateSnapshot {
  const { __history__, ...rest } = currentState;
  // ディープコピーで参照を切る
  return JSON.parse(JSON.stringify(rest)) as GameStateSnapshot;
}

/**
 * 新しいルームを作成
 * @param template - ゲームテンプレート
 * @returns 作成されたルーム情報
 */
export async function createRoom(
  template: GameTemplate
): Promise<{ room: Room; error: Error | null }> {
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
 * @param roomId - ルームID
 * @param fromId - 送信元ID（"__pot__" またはユーザーID）
 * @param toId - 送信先ID（"__pot__" またはユーザーID）
 * @param amount - 移動する金額
 * @param variable - 移動する変数（デフォルトは "score"）
 * @param fromName - 送信元の表示名（履歴用、省略時はID）
 * @param toName - 送信先の表示名（履歴用、省略時はID）
 */
export async function transferScore(
  roomId: string,
  fromId: string,
  toId: string,
  amount: number,
  variable: string = "score",
  fromName?: string,
  toName?: string
): Promise<{ error: Error | null }> {
  try {
    // 1. 最新の current_state を取得（重要！通信ラグ対策）
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

    // 2. 操作前のスナップショットを作成（履歴用）
    const beforeSnapshot = createSnapshot(room.current_state);

    // 3. 最新データを元に計算
    const currentState = { ...room.current_state };

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
      if (fromValue < amount) {
        throw new Error("点数が不足しています");
      }

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
      if (fromValue < amount) {
        throw new Error("点数が不足しています");
      }

      currentState[fromId][variable] = fromValue - amount;
      currentState[toId][variable] =
        ((currentState[toId][variable] as number) || 0) + amount;
    }

    // 4. 履歴エントリを作成
    const displayFromName =
      fromName || (fromId === "__pot__" ? "供託" : fromId.substring(0, 8));
    const displayToName =
      toName || (toId === "__pot__" ? "供託" : toId.substring(0, 8));

    const historyEntry: HistoryEntry = {
      id: generateUUID(),
      timestamp: Date.now(),
      message: `${displayFromName} → ${displayToName}: ${amount}`,
      snapshot: beforeSnapshot,
    };
    // 5. 履歴配列に追加
    const existingHistory = currentState.__history__ || [];
    currentState.__history__ = [...existingHistory, historyEntry];

    // 6. Supabaseに保存
    const { error: updateError } = await supabase
      .from("rooms")
      .update({ current_state: currentState })
      .eq("id", roomId);

    if (updateError) {
      throw updateError;
    }

    return { error: null };
  } catch (error) {
    console.error("Error transferring score:", error);
    return {
      error:
        error instanceof Error
          ? error
          : new Error("スコアの移動に失敗しました"),
    };
  }
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
  try {
    // 現在のユーザーを取得
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

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
  try {
    // 1. 最新のルーム情報を取得
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

    const currentState = room.current_state;
    const history: HistoryEntry[] = currentState.__history__ || [];

    // 2. 指定されたhistoryIdを探す
    const targetIndex = history.findIndex((entry) => entry.id === historyId);

    if (targetIndex === -1) {
      throw new Error("指定された履歴が見つかりません");
    }

    // 3. 見つかった要素のsnapshotを展開
    const targetEntry = history[targetIndex];

    const restoredState = { ...targetEntry.snapshot };

    // 4. ロールバック地点より「未来」の履歴を削除（targetIndexまで残す）
    const truncatedHistory = history.slice(0, targetIndex);

    // 5. ロールバック操作自体を履歴に追加
    const rollbackEntry: HistoryEntry = {
      id: generateUUID(),
      timestamp: Date.now(),
      message: `🔄 ロールバック (${new Date(targetEntry.timestamp).toLocaleTimeString("ja-JP")})`,
      snapshot: createSnapshot(currentState), // ロールバック前の状態を保存
    };

    // 6. 新しいcurrent_stateを構築
    const newState = {
      ...restoredState,
      __history__: [...truncatedHistory, rollbackEntry],
    };

    // 7. Supabaseに保存
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
 * 直前の操作を取り消す（Undo）
 * @param roomId - ルームID
 * @returns エラー情報
 */
export async function undoLast(
  roomId: string
): Promise<{ error: Error | null }> {
  try {
    // 1. 最新のルーム情報を取得
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

    const currentState = room.current_state;
    const history: HistoryEntry[] = currentState.__history__ || [];

    if (history.length === 0) {
      throw new Error("取り消せる操作がありません");
    }

    // 2. 最後の履歴エントリを取得
    const lastEntry = history[history.length - 1];

    // 3. 最後のエントリのsnapshotを復元
    const restoredState = { ...lastEntry.snapshot };

    // 4. 最後の履歴を削除
    const truncatedHistory = history.slice(0, -1);

    // 5. 新しいcurrent_stateを構築
    const newState = {
      ...restoredState,
      __history__: truncatedHistory,
    };

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
