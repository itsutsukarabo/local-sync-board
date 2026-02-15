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
  /** Realtime チャンネルが切断中・エラー中の場合 true */
  isRealtimeDisconnected: boolean;
  /** 再接続成功後、一時的に true になる（5秒間） */
  isReconnected: boolean;
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
  const [isRealtimeDisconnected, setIsRealtimeDisconnected] = useState(false);
  const [isReconnected, setIsReconnected] = useState(false);
  const reconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 切断を経験したかどうか（初回接続では再接続バナーを出さない）
  const hasBeenDisconnectedRef = useRef(false);
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
  // チャンネル再構築用のトリガー
  const [channelRebuildKey, setChannelRebuildKey] = useState(0);
  // チャンネル再購読リトライ回数
  const resubscribeAttemptsRef = useRef(0);
  const MAX_RESUBSCRIBE_ATTEMPTS = 3;

  // 切断→復帰時にバナーを5秒間表示するヘルパー
  const markReconnected = useCallback(() => {
    if (!hasBeenDisconnectedRef.current) return;
    setIsRealtimeDisconnected(false);
    setIsReconnected(true);
    hasBeenDisconnectedRef.current = false;
    if (reconnectedTimerRef.current) clearTimeout(reconnectedTimerRef.current);
    reconnectedTimerRef.current = setTimeout(() => {
      setIsReconnected(false);
    }, 5_000);
  }, []);

  const markDisconnected = useCallback(() => {
    setIsRealtimeDisconnected(true);
    hasBeenDisconnectedRef.current = true;
    // 再接続バナーが出ている最中に再切断した場合は消す
    if (reconnectedTimerRef.current) {
      clearTimeout(reconnectedTimerRef.current);
      reconnectedTimerRef.current = null;
    }
    setIsReconnected(false);
  }, []);

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
            // REST で取得できているなら接続警告バナーも解除
            markReconnected();
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
      console.warn(
        `[useRoomRealtime] roomId is falsy (${roomId}), setting room=null. This may cause "ルームが見つかりません" screen.`
      );
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
    let resubscribeTimer: ReturnType<typeof setTimeout> | null = null;

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
        .subscribe((status, err) => {
          dbg("channel status:", status, err);
          if (status === "SUBSCRIBED") {
            markReconnected();
            resubscribeAttemptsRef.current = 0;
            // 再接続後はデータを最新化
            refetchRef.current();
          } else if (status === "CHANNEL_ERROR") {
            console.error(
              "Realtime channel error:",
              err ?? "WebSocket connection lost"
            );
            markDisconnected();
            resubscribeAttemptsRef.current += 1;
            if (resubscribeTimer) clearTimeout(resubscribeTimer);
            if (resubscribeAttemptsRef.current >= MAX_RESUBSCRIBE_ATTEMPTS) {
              // リトライ上限超過 → チャンネルを破棄して新しく作り直す
              console.warn(
                `Resubscribe failed ${MAX_RESUBSCRIBE_ATTEMPTS} times, rebuilding channel`
              );
              resubscribeAttemptsRef.current = 0;
              resubscribeTimer = setTimeout(() => {
                setChannelRebuildKey((k) => k + 1);
              }, 3_000);
            } else {
              // 通常のリトライ
              resubscribeTimer = setTimeout(() => {
                if (channel) {
                  channel.subscribe();
                }
              }, 5_000);
            }
          } else if (status === "TIMED_OUT") {
            console.error("Realtime channel timed out, retrying...");
            markDisconnected();
            if (resubscribeTimer) clearTimeout(resubscribeTimer);
            resubscribeTimer = setTimeout(() => {
              if (channel) {
                channel.subscribe();
              }
            }, 5_000);
          } else if (status === "CLOSED") {
            dbg("channel closed");
            markDisconnected();
          }
        });
    };

    // 初期化
    fetchInitialData();
    setupRealtimeSubscription();

    // クリーンアップ
    return () => {
      dbg("cleanup: removing channel");
      if (resubscribeTimer) clearTimeout(resubscribeTimer);
      if (reconnectedTimerRef.current) clearTimeout(reconnectedTimerRef.current);
      if (channel) {
        supabase.removeChannel(channel);
      }
      setIsRealtimeDisconnected(false);
      setIsReconnected(false);
    };
  }, [roomId, channelRebuildKey]);

  // アプリ復帰時にデータを再取得
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && roomId) {
        refetchRef.current();
      }
    });
    return () => subscription.remove();
  }, [roomId]);

  return { room, loading, error, refetch, isRealtimeDisconnected, isReconnected };
}
