/**
 * ルーム管理API
 * Supabaseとのやり取りを行うルーム関連の関数
 */

import { supabase } from "./supabase";
import {
  Room,
  GameTemplate,
  GameStateSnapshot,
  SeatInfo,
  Settlement,
} from "../types";
import { generateRoomCode, isHostUser } from "../utils/roomUtils";

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
 * RPC呼び出しの共通ラッパー
 * 戻り値 JSONB {success: true} or {error: "メッセージ"} をパース
 */
async function callRpc(
  fnName: string,
  params: Record<string, unknown>
): Promise<{ error: Error | null }> {
  const { data, error: rpcError } = await supabase.rpc(fnName, params);
  if (rpcError) {
    console.error(`RPC ${fnName} failed:`, rpcError);
    return { error: new Error(rpcError.message) };
  }
  if (data?.error) {
    return { error: new Error(data.error) };
  }
  return { error: null };
}

/**
 * 新しいルームを作成
 * @param template - ゲームテンプレート
 * @param roomName - ルーム名
 * @returns 作成されたルーム情報
 */
export async function createRoom(
  template: GameTemplate,
  roomName: string
): Promise<{ room: Room; error: Error | null }> {
  apiLog("createRoom", { layout: template.layoutMode, roomName });
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
        room_name: roomName,
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
 * スコアを移動（DB側RPCで原子的に処理）
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
  return callRpc("rpc_transfer_score", {
    p_room_id: roomId,
    p_from_id: fromId,
    p_to_id: toId,
    p_transfers: transfers,
    p_from_name: fromName ?? null,
    p_to_name: toName ?? null,
  });
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
 * 指定した履歴IDの時点にロールバック（DB側RPCで原子的に処理）
 * @param roomId - ルームID
 * @param historyId - ロールバック先の履歴ID
 */
export async function rollbackTo(
  roomId: string,
  historyId: string
): Promise<{ error: Error | null }> {
  apiLog("rollbackTo", { roomId, historyId });
  return callRpc("rpc_rollback_to", {
    p_room_id: roomId,
    p_history_id: historyId,
  });
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
 * プレイヤーのスコアを強制編集（DB側RPCで原子的に処理）
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
  return callRpc("rpc_force_edit_score", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_updates: updates,
    p_display_name: displayName ?? null,
  });
}

/**
 * 選択した変数を全プレイヤーで初期値にリセット（DB側RPCで原子的に処理）
 * @param roomId - ルームID
 * @param variableKeys - リセット対象の変数キー配列
 */
export async function resetScores(
  roomId: string,
  variableKeys: string[]
): Promise<{ error: Error | null }> {
  apiLog("resetScores", { roomId, variableKeys });
  return callRpc("rpc_reset_scores", {
    p_room_id: roomId,
    p_variable_keys: variableKeys,
  });
}

/**
 * 直前の操作を取り消す（DB側RPCで原子的に処理）
 * @param roomId - ルームID
 */
export async function undoLast(
  roomId: string
): Promise<{ error: Error | null }> {
  apiLog("undoLast", { roomId });
  return callRpc("rpc_undo_last", {
    p_room_id: roomId,
  });
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
): Promise<{ room: Room | null; error: Error | null }> {
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

    // 3. ホスト確認（作成者またはコホスト）
    if (!isHostUser(user.id, room as Room)) {
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
    const { data: updateData, error: updateError } = await supabase
      .from("rooms")
      .update({
        seats,
        current_state: currentState,
      })
      .eq("id", roomId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return { room: updateData as Room, error: null };
  } catch (error) {
    console.error("Error joining fake seat:", error);
    return {
      room: null,
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
): Promise<{ room: Room | null; error: Error | null }> {
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
    const { data: updateData, error: updateError } = await supabase
      .from("rooms")
      .update({ seats })
      .eq("id", roomId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return { room: updateData as Room, error: null };
  } catch (error) {
    console.error("Error reseating fake player:", error);
    return {
      room: null,
      error:
        error instanceof Error
          ? error
          : new Error("ゲストの再着席に失敗しました"),
    };
  }
}

/**
 * カウンター値を Compare-and-Swap で更新（DB側RPCで原子的に処理）
 * @param roomId - ルームID
 * @param expectedValue - 編集開始時点のサーバー値（CASのexpected）
 * @param newValue - 新しいカウンター値
 * @returns error または conflictValue（競合時のDB現在値）
 */
export async function updateCounter(
  roomId: string,
  expectedValue: number,
  newValue: number
): Promise<{ error: Error | null; conflictValue?: number }> {
  apiLog("updateCounter", { roomId, expectedValue, newValue });
  const client = supabase;
  const { data, error } = await client.rpc("rpc_update_counter", {
    p_room_id: roomId,
    p_expected_value: expectedValue,
    p_new_value: newValue,
  });
  if (error) return { error: new Error(error.message) };
  if (data?.error) return { error: new Error(data.error) };
  if (data?.conflict) return { error: null, conflictValue: data.current_value as number };
  return { error: null };
}

/**
 * コホスト（追加ホスト）リストを更新する（ルーム作成者のみ呼び出し可）
 * @param roomId - ルームID
 * @param coHostIds - コホストのユーザーID配列
 */
export async function updateCoHosts(
  roomId: string,
  coHostIds: string[]
): Promise<{ error: Error | null }> {
  apiLog("updateCoHosts", { roomId, count: coHostIds.length });
  const { error } = await supabase
    .from("rooms")
    .update({ co_host_ids: coHostIds })
    .eq("id", roomId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * ルーム名を更新
 * @param roomId - ルームID
 * @param roomName - 新しいルーム名
 */
export async function updateRoomName(
  roomId: string,
  roomName: string
): Promise<{ error: Error | null }> {
  apiLog("updateRoomName", { roomId, roomName });
  const { error } = await supabase
    .from("rooms")
    .update({ room_name: roomName })
    .eq("id", roomId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * 自分が作成した過去のルームを取得（テンプレートコピー用）
 * @param excludeRoomId - 除外するルームID（現在のルーム）
 * @param layoutMode - フィルタするレイアウトモード
 * @param limit - 取得件数（デフォルト5）
 */
export async function fetchMyPastRooms(
  excludeRoomId: string,
  layoutMode: string,
  limit: number = 5
): Promise<{
  rooms: Pick<Room, "id" | "room_name" | "room_code" | "template" | "created_at">[];
  error: Error | null;
}> {
  apiLog("fetchMyPastRooms", { excludeRoomId, layoutMode, limit });
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("ユーザーが認証されていません");
    }

    const { data, error } = await supabase
      .from("rooms")
      .select("id, room_name, room_code, template, created_at")
      .eq("host_user_id", user.id)
      .neq("id", excludeRoomId)
      .filter("template->>layoutMode", "eq", layoutMode)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return {
      rooms: (data || []) as Pick<Room, "id" | "room_name" | "room_code" | "template" | "created_at">[],
      error: null,
    };
  } catch (error) {
    console.error("Error fetching past rooms:", error);
    return {
      rooms: [],
      error: error instanceof Error ? error : new Error("過去のルームの取得に失敗しました"),
    };
  }
}

/**
 * 精算結果を保存し、スコアを初期値にリセット（DB側RPCで原子的に処理）
 * @param roomId - ルームID
 * @param settlement - 精算結果オブジェクト
 */
export async function saveSettlement(
  roomId: string,
  settlement: Settlement
): Promise<{ error: Error | null }> {
  apiLog("saveSettlement", { roomId });
  return callRpc("rpc_save_settlement", {
    p_room_id: roomId,
    p_settlement_id: settlement.id,
    p_player_results: settlement.playerResults,
  });
}

/**
 * 調整行を保存（DB側RPCで原子的に処理、スコア変更なし）
 * @param roomId - ルームID
 * @param settlement - 調整結果オブジェクト (type="adjustment")
 */
export async function saveAdjustment(
  roomId: string,
  settlement: Settlement
): Promise<{ error: Error | null }> {
  apiLog("saveAdjustment", { roomId });
  return callRpc("rpc_save_adjustment", {
    p_room_id: roomId,
    p_settlement_id: settlement.id,
    p_player_results: settlement.playerResults,
  });
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
