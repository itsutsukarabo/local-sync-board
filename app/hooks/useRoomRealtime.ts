/**
 * ルームのリアルタイム購読フック
 * Supabase Realtimeを使用してルームの変更を監視
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Room } from "../types";
import { migrateTemplate } from "../utils/roomUtils";

interface UseRoomRealtimeResult {
  room: Room | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
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
  const mountTimeRef = useRef(Date.now());
  const dbg = (msg: string, ...args: unknown[]) =>
    console.log(`[useRoomRealtime +${Date.now() - mountTimeRef.current}ms]`, msg, ...args);

  // 手動でデータを再取得する関数
  const refetch = useCallback(async () => {
    if (!roomId) return;
    try {
      const { data, error: fetchError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      if (data) {
        const roomData = data as Room;
        roomData.template = migrateTemplate(roomData.template);
        setRoom(roomData);
      }
    } catch (err) {
      console.error("Error refetching room:", err);
    }
  }, [roomId]);

  // stale closure対策: Realtimeコールバック内で常に最新のrefetchを参照
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    dbg("useEffect fired, roomId =", roomId);
    if (!roomId) {
      dbg("roomId is falsy → setLoading(false)");
      setRoom(null);
      setLoading(false);
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;

    // 初期データの取得
    const fetchInitialData = async () => {
      dbg("fetchInitialData START");
      try {
        setLoading(true);
        setError(null);

        dbg("supabase query START");
        const { data, error: fetchError } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", roomId)
          .single();
        dbg("supabase query END, hasData:", !!data, "hasError:", !!fetchError);

        if (fetchError) {
          throw fetchError;
        }

        if (!data) {
          throw new Error("ルームが見つかりません");
        }

        const roomData = data as Room;
        roomData.template = migrateTemplate(roomData.template);
        dbg("setRoom (data received)");
        setRoom(roomData);
      } catch (err) {
        dbg("fetchInitialData CATCH:", err);
        console.error("Error fetching room:", err);
        setError(
          err instanceof Error ? err : new Error("ルームの取得に失敗しました")
        );
      } finally {
        dbg("fetchInitialData FINALLY → setLoading(false)");
        setLoading(false);
      }
    };

    // Realtime購読の設定
    // チャンネル名をユニーク化し、複数画面で同名チャンネルの衝突を防止
    const channelId = `room-${roomId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const setupRealtimeSubscription = () => {
      dbg("setupRealtimeSubscription, channelId =", channelId);
      channel = supabase
        .channel(channelId)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${roomId}`,
          },
          () => {
            refetchRef.current();
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
          () => {
            setRoom(null);
            setError(new Error("ルームが削除されました"));
          }
        )
        .subscribe();
    };

    // 初期化
    fetchInitialData();
    setupRealtimeSubscription();

    // クリーンアップ
    return () => {
      dbg("cleanup: removing channel");
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [roomId]);

  return { room, loading, error, refetch };
}
