/**
 * ルームのリアルタイム購読フック
 * Supabase Realtimeを使用してルームの変更を監視
 */

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Room } from "../types";

interface UseRoomRealtimeResult {
  room: Room | null;
  loading: boolean;
  error: Error | null;
}

/**
 * 指定されたルームIDのリアルタイム購読
 * @param roomId - 購読するルームID
 * @returns ルーム情報、ローディング状態、エラー
 */
export function useRoomRealtime(roomId: string | null): UseRoomRealtimeResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setLoading(false);
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;

    // 初期データの取得
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", roomId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (!data) {
          throw new Error("ルームが見つかりません");
        }

        console.log("Initial room data:", data);
        console.log("Current state:", data.current_state);
        setRoom(data as Room);
      } catch (err) {
        console.error("Error fetching room:", err);
        setError(
          err instanceof Error ? err : new Error("ルームの取得に失敗しました")
        );
      } finally {
        setLoading(false);
      }
    };

    // Realtime購読の設定
    const setupRealtimeSubscription = () => {
      channel = supabase
        .channel(`room-${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            console.log("Room updated:", payload);
            setRoom(payload.new as Room);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            console.log("Room deleted:", payload);
            setRoom(null);
            setError(new Error("ルームが削除されました"));
          }
        )
        .subscribe((status) => {
          console.log("Subscription status:", status);
        });
    };

    // 初期化
    fetchInitialData();
    setupRealtimeSubscription();

    // クリーンアップ
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [roomId]);

  return { room, loading, error };
}
