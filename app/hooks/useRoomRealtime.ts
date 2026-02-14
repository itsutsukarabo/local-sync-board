/**
 * ルームのリアルタイム購読フック
 * Supabase Realtimeを使用してルームの変更を監視
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
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
  // デバッグ用ログ（通常は無効化。調査時に console.log に切り替え）
  const mountTimeRef = useRef(Date.now());
  const dbg = (_msg: string, ..._args: unknown[]) => {};

  // デバウンス用 ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 前回の Promise の resolve を保持（リーク防止）
  const pendingResolveRef = useRef<(() => void) | null>(null);
  // 連続 refetch 失敗カウント（一時的な通信エラーでは即座にエラー表示しない）
  const consecutiveFailuresRef = useRef(0);
  const REFETCH_FAILURE_THRESHOLD = 3;

  // 手動でデータを再取得する関数（デバウンス300ms + タイムアウト10秒）
  const refetch = useCallback(async () => {
    if (!roomId) return;

    // 前回のデバウンスタイマーをクリア
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    // 前回の Promise を即座に resolve（await している呼び出し元をハングさせない）
    if (pendingResolveRef.current) {
      pendingResolveRef.current();
      pendingResolveRef.current = null;
    }

    return new Promise<void>((resolve) => {
      pendingResolveRef.current = resolve;
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);

          const { data, error: fetchError } = await supabase
            .from("rooms")
            .select("*")
            .eq("id", roomId)
            .abortSignal(controller.signal)
            .single();

          clearTimeout(timeout);

          if (fetchError) {
            throw fetchError;
          }

          if (data) {
            const roomData = data as Room;
            roomData.template = migrateTemplate(roomData.template);
            setRoom(roomData);
            // 成功したらエラーと失敗カウントをリセット
            consecutiveFailuresRef.current = 0;
            if (error) setError(null);
          }
        } catch (err) {
          console.error("Error refetching room:", err);
          consecutiveFailuresRef.current += 1;
          // 連続失敗が閾値を超えたらエラーをUIに反映（ただしroomはnullにしない）
          if (consecutiveFailuresRef.current >= REFETCH_FAILURE_THRESHOLD) {
            setError(
              err instanceof Error
                ? err
                : new Error("サーバーとの通信に失敗しています")
            );
          }
        } finally {
          // このタイマーの resolve がまだ pending なら解決
          if (pendingResolveRef.current === resolve) {
            pendingResolveRef.current = null;
          }
          resolve();
        }
      }, 300);
    });
  }, [roomId, error]);

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

  // アプリ復帰時にデータを再取得
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && roomId) {
        refetchRef.current();
      }
    });
    return () => subscription.remove();
  }, [roomId]);

  return { room, loading, error, refetch };
}
