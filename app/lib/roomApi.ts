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
} from "../types";
import { generateRoomCode } from "../utils/roomUtils";

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

    // ルームを作成
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_user_id: user.id,
        status: "waiting",
        template: template,
        current_state: {},
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

    // プレイヤーをルームの状態に追加
    const currentState = room.current_state || {};

    // 既に参加している場合はスキップ
    if (!currentState[user.id]) {
      // テンプレートから初期値を設定
      const initialState: Record<string, number> = {};
      room.template.variables.forEach((variable) => {
        initialState[variable.key] = variable.initial;
      });

      currentState[user.id] = initialState;

      // ルームの状態を更新
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ current_state: currentState })
        .eq("id", room.id);

      if (updateError) {
        throw updateError;
      }
    }

    // プロファイルのcurrent_room_idを更新
    await supabase
      .from("profiles")
      .update({ current_room_id: room.id })
      .eq("id", user.id);

    // 更新されたルーム情報を取得
    const { data: updatedRoom, error: fetchError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", room.id)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    return { room: updatedRoom as Room, error: null };
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
