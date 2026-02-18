/**
 * ルームのリアルタイム購読フック
 * Supabase Realtimeを使用してルームの変更を監視
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { Room } from "../types";
import { migrateTemplate } from "../utils/roomUtils";

// roomId が解決しないまま放置された場合のタイムアウト（ms）
const ROOM_ID_RESOLVE_TIMEOUT_MS = 5_000;

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
  // ── roomId 安定化 ──
  // expo-router の useLocalSearchParams が一時的に undefined を返すことがあるため、
  // 一度 truthy になった roomId は undefined に戻さない。
  // state で管理することで useEffect の依存配列が安定し、
  // 不要な cleanup → 再初期化（スピナー表示・チャンネル再構築）を防止する。
  const [stableRoomId, setStableRoomId] = useState(roomId);
  useEffect(() => {
    if (roomId) {
      setStableRoomId((prev) => prev !== roomId ? roomId : prev);
    }
  }, [roomId]);
  // コールバック内から参照するための ref
  const roomIdRef = useRef(stableRoomId);
  roomIdRef.current = stableRoomId;

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRealtimeDisconnected, setIsRealtimeDisconnected] = useState(false);
  const [isReconnected, setIsReconnected] = useState(false);
  const reconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 切断を経験したかどうか（初回接続では再接続バナーを出さない）
  const hasBeenDisconnectedRef = useRef(false);

  // 操作元の二重 refetch 防止用クールダウン
  const lastManualRefetchTime = useRef<number>(0);
  const REFETCH_COOLDOWN_MS = 500;

  // デバウンス用 ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 前回の Promise の resolve を保持（リーク防止）
  const pendingResolveRef = useRef<(() => void) | null>(null);
  // 連続 refetch 失敗カウント（一時的な通信エラーでは即座にエラー表示しない）
  const consecutiveFailuresRef = useRef(0);
  const REFETCH_FAILURE_THRESHOLD = 3;
  // チャンネル再購読リトライ回数
  const resubscribeAttemptsRef = useRef(0);
  const MAX_RESUBSCRIBE_ATTEMPTS = 3;
  // チャンネル参照（useEffect 外からチャンネル再構築するため）
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // 初回接続かどうか（fetchInitialData と SUBSCRIBED refetch の競合防止）
  const isInitialSubscribeRef = useRef(true);

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
    const id = roomIdRef.current;
    if (!id) return;

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
            .eq("id", id)
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
            lastManualRefetchTime.current = Date.now();
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
  }, [error]);

  // stale closure対策: Realtimeコールバック内で常に最新のrefetchを参照
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // チャンネルを破棄して新しく作り直す（useEffect 再実行なし）
  const rebuildChannel = useCallback(() => {
    const id = roomIdRef.current;
    if (!id) return;

    // 既存チャンネルを破棄
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // 新しいチャンネルを構築
    setupRealtimeSubscriptionFn(id);

    // 再構築後はデータを最新化
    refetchRef.current();
  }, []);

  // Realtime購読の設定（関数として切り出し、rebuildChannel からも呼べるようにする）
  const resubscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setupRealtimeSubscriptionFn = useCallback((targetRoomId: string) => {
    const channelId = `room-${targetRoomId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const ch = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${targetRoomId}`,
        },
        (payload) => {
          // 直近の手動 refetch でデータ取得済みならスキップ（二重取得防止）
          const elapsed = Date.now() - lastManualRefetchTime.current;
          if (elapsed < REFETCH_COOLDOWN_MS) {
            return;
          }

          const newRoom = payload.new;
          // ペイロードが完全な Room データを含むか検証（REPLICA IDENTITY FULL が必要）
          if (newRoom && newRoom.id && newRoom.current_state && newRoom.template) {
            const roomData = newRoom as Room;
            roomData.template = migrateTemplate(roomData.template);
            setRoom(roomData);
            markReconnected();
          } else {
            refetchRef.current();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${targetRoomId}`,
        },
        () => {
          setRoom(null);
          setError(new Error("ルームが削除されました"));
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          markReconnected();
          resubscribeAttemptsRef.current = 0;
          // 初回接続では fetchInitialData が既にデータを取得済みなので refetch 不要。
          // 再接続時のみ refetch して最新データに同期する。
          if (isInitialSubscribeRef.current) {
            isInitialSubscribeRef.current = false;
          } else {
            refetchRef.current();
          }
        } else if (status === "CHANNEL_ERROR") {
          console.error(
            "Realtime channel error:",
            err ?? "WebSocket connection lost"
          );
          markDisconnected();
          resubscribeAttemptsRef.current += 1;
          if (resubscribeTimerRef.current) clearTimeout(resubscribeTimerRef.current);
          if (resubscribeAttemptsRef.current >= MAX_RESUBSCRIBE_ATTEMPTS) {
            // リトライ上限超過 → チャンネルを破棄して新しく作り直す
            console.warn(
              `Resubscribe failed ${MAX_RESUBSCRIBE_ATTEMPTS} times, rebuilding channel`
            );
            resubscribeAttemptsRef.current = 0;
            resubscribeTimerRef.current = setTimeout(() => {
              rebuildChannel();
            }, 3_000);
          } else {
            // 通常のリトライ
            resubscribeTimerRef.current = setTimeout(() => {
              if (channelRef.current) {
                channelRef.current.subscribe();
              }
            }, 5_000);
          }
        } else if (status === "TIMED_OUT") {
          console.error("Realtime channel timed out, retrying...");
          markDisconnected();
          if (resubscribeTimerRef.current) clearTimeout(resubscribeTimerRef.current);
          resubscribeTimerRef.current = setTimeout(() => {
            if (channelRef.current) {
              channelRef.current.subscribe();
            }
          }, 5_000);
        } else if (status === "CLOSED") {
          markDisconnected();
        }
      });

    channelRef.current = ch;
  }, [markReconnected, markDisconnected]);

  // メインの初期化 Effect
  useEffect(() => {
    if (!stableRoomId) {
      // roomId が未解決のまま一定時間経過したら、無限スピナーではなくエラーに遷移する。
      // AuthGuard による不意のアンマウント→再マウント等でナビゲーション状態が失われ、
      // roomId が永続的に undefined になるケースへの安全策。
      const timeout = setTimeout(() => {
        // タイムアウト時点でもまだ roomId が解決していなければエラーにする
        if (!roomIdRef.current) {
          setLoading(false);
          setError(new Error("ルームIDを取得できませんでした"));
        }
      }, ROOM_ID_RESOLVE_TIMEOUT_MS);
      return () => clearTimeout(timeout);
    }

    // 初期データの取得
    let aborted = false;
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const { data, error: fetchError } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", stableRoomId)
          .abortSignal(controller.signal)
          .single();

        clearTimeout(timeout);

        if (aborted) return;

        if (fetchError) {
          throw fetchError;
        }

        if (!data) {
          throw new Error("ルームが見つかりません");
        }

        const roomData = data as Room;
        roomData.template = migrateTemplate(roomData.template);
        setRoom(roomData);
      } catch (err) {
        if (aborted) return;
        console.error("Error fetching room:", err);
        setError(
          err instanceof Error ? err : new Error("ルームの取得に失敗しました")
        );
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    };

    // 初期化
    fetchInitialData();
    setupRealtimeSubscriptionFn(stableRoomId);

    // クリーンアップ
    return () => {
      aborted = true;
      if (resubscribeTimerRef.current) clearTimeout(resubscribeTimerRef.current);
      if (reconnectedTimerRef.current) clearTimeout(reconnectedTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsRealtimeDisconnected(false);
      setIsReconnected(false);
    };
  }, [stableRoomId]);

  // アプリ復帰時にデータを再取得
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && roomIdRef.current) {
        refetchRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  return { room, loading, error, refetch, isRealtimeDisconnected, isReconnected };
}
