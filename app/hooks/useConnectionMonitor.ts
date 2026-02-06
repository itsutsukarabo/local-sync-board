/**
 * Presence管理・切断検知・タイムアウト処理の中核フック
 * Supabase Presence APIを使用し、DBへの定期書き込みは行わない
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { forceLeaveSeat } from "../lib/roomApi";
import { ConnectionStatus, SeatInfo } from "../types";
import {
  HEARTBEAT_INTERVAL_MS,
  GRACE_PERIOD_MS,
  DEFAULT_FORCE_LEAVE_TIMEOUT_SEC,
} from "../constants/connection";

interface UseConnectionMonitorResult {
  connectionStatuses: Map<string, ConnectionStatus>;
}

export function useConnectionMonitor(
  roomId: string | null,
  userId: string | null,
  seats: (SeatInfo | null)[],
  forceLeaveTimeoutSec?: number,
): UseConnectionMonitorResult {
  const forceLeaveMs =
    (forceLeaveTimeoutSec ?? DEFAULT_FORCE_LEAVE_TIMEOUT_SEC) * 1000;
  const [connectionStatuses, setConnectionStatuses] = useState<
    Map<string, ConnectionStatus>
  >(new Map());

  const seatsRef = useRef(seats);
  seatsRef.current = seats;

  const graceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const forceLeaveTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusesRef = useRef<Map<string, ConnectionStatus>>(new Map());

  // 着席中ユーザーIDを取得するヘルパー
  const getSeatedUserIds = useCallback((): Set<string> => {
    const ids = new Set<string>();
    for (const seat of seatsRef.current) {
      if (seat?.userId) {
        ids.add(seat.userId);
      }
    }
    return ids;
  }, []);

  // タイマークリアヘルパー
  const clearGraceTimer = useCallback((targetUserId: string) => {
    const timer = graceTimersRef.current.get(targetUserId);
    if (timer) {
      clearTimeout(timer);
      graceTimersRef.current.delete(targetUserId);
    }
  }, []);

  const clearForceLeaveTimer = useCallback((targetUserId: string) => {
    const timer = forceLeaveTimersRef.current.get(targetUserId);
    if (timer) {
      clearTimeout(timer);
      forceLeaveTimersRef.current.delete(targetUserId);
    }
  }, []);

  const clearAllTimersForUser = useCallback(
    (targetUserId: string) => {
      clearGraceTimer(targetUserId);
      clearForceLeaveTimer(targetUserId);
    },
    [clearGraceTimer, clearForceLeaveTimer]
  );

  // ユーザーを「接続中」に設定
  const markConnected = useCallback(
    (targetUserId: string) => {
      clearAllTimersForUser(targetUserId);
      const status: ConnectionStatus = {
        userId: targetUserId,
        isConnected: true,
        disconnectedAt: null,
      };
      statusesRef.current.set(targetUserId, status);
      setConnectionStatuses(new Map(statusesRef.current));
    },
    [clearAllTimersForUser]
  );

  // ユーザーを「切断中」に設定し、10分タイマー開始
  const markDisconnected = useCallback(
    (targetUserId: string, currentRoomId: string) => {
      const now = Date.now();
      const status: ConnectionStatus = {
        userId: targetUserId,
        isConnected: false,
        disconnectedAt: now,
      };
      statusesRef.current.set(targetUserId, status);
      setConnectionStatuses(new Map(statusesRef.current));

      // 10分強制離席タイマー開始
      clearForceLeaveTimer(targetUserId);
      const timer = setTimeout(() => {
        forceLeaveTimersRef.current.delete(targetUserId);
        forceLeaveSeat(currentRoomId, targetUserId);
      }, forceLeaveMs);
      forceLeaveTimersRef.current.set(targetUserId, timer);
    },
    [clearForceLeaveTimer, forceLeaveMs]
  );

  // 60秒猶予タイマー開始
  const startGraceTimer = useCallback(
    (targetUserId: string, currentRoomId: string) => {
      clearGraceTimer(targetUserId);
      const timer = setTimeout(() => {
        graceTimersRef.current.delete(targetUserId);
        // 猶予切れ → 切断中に設定
        markDisconnected(targetUserId, currentRoomId);
      }, GRACE_PERIOD_MS);
      graceTimersRef.current.set(targetUserId, timer);
    },
    [clearGraceTimer, markDisconnected]
  );

  useEffect(() => {
    if (!roomId || !userId) return;

    const currentRoomId = roomId;
    const currentUserId = userId;

    // Presenceチャンネル作成（全クライアント共通名）
    const channel = supabase.channel(`presence-room-${currentRoomId}`, {
      config: { presence: { key: currentUserId } },
    });
    channelRef.current = channel;

    // Presenceイベントハンドラ
    channel
      .on("presence", { event: "join" }, ({ key }) => {
        if (!key) return;
        markConnected(key);
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (!key || key === currentUserId) return;
        // 着席中のユーザーのみ猶予タイマー開始
        const seatedIds = getSeatedUserIds();
        if (seatedIds.has(key)) {
          startGraceTimer(key, currentRoomId);
        }
      })
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const presentUserIds = new Set(Object.keys(presenceState));
        const seatedIds = getSeatedUserIds();

        // 着席中だがPresenceに不在のユーザーを検出
        for (const seatedUserId of seatedIds) {
          if (seatedUserId === currentUserId) continue;
          if (!presentUserIds.has(seatedUserId)) {
            // まだ猶予タイマーもなく、切断判定もされていない場合のみ開始
            const existing = statusesRef.current.get(seatedUserId);
            if (
              !graceTimersRef.current.has(seatedUserId) &&
              (!existing || existing.isConnected)
            ) {
              startGraceTimer(seatedUserId, currentRoomId);
            }
          } else {
            markConnected(seatedUserId);
          }
        }
      });

    // チャンネル購読 → 自身をtrack
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: currentUserId,
          online_at: new Date().toISOString(),
        });
      }
    });

    // 30秒ハートビート
    heartbeatRef.current = setInterval(() => {
      channel.track({
        user_id: currentUserId,
        online_at: new Date().toISOString(),
      });
      // 表示更新トリガー（切断中テキストの経過時間更新）
      setConnectionStatuses(new Map(statusesRef.current));
    }, HEARTBEAT_INTERVAL_MS);

    // AppState連携: アプリ復帰時にtrack再呼び出し
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active" && channelRef.current) {
          channelRef.current.track({
            user_id: currentUserId,
            online_at: new Date().toISOString(),
          });
        }
      }
    );

    // クリーンアップ
    return () => {
      // 全タイマークリア
      for (const timer of graceTimersRef.current.values()) {
        clearTimeout(timer);
      }
      graceTimersRef.current.clear();

      for (const timer of forceLeaveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      forceLeaveTimersRef.current.clear();

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      appStateSubscription.remove();

      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;

      statusesRef.current.clear();
      setConnectionStatuses(new Map());
    };
  }, [roomId, userId, forceLeaveMs]);

  // seats配列を安定したキーにシリアライズ（参照変更による無限ループ防止）
  const seatsKey = useMemo(
    () => seats.map((s) => s?.userId ?? "").join(","),
    [seats]
  );

  // seats変更への追従: 座席から外れたユーザーのタイマーをクリア、statusesから削除
  useEffect(() => {
    const seatedIds = getSeatedUserIds();
    let changed = false;

    // statusesに存在するが着席していないユーザーを削除
    for (const uid of statusesRef.current.keys()) {
      if (!seatedIds.has(uid)) {
        clearAllTimersForUser(uid);
        statusesRef.current.delete(uid);
        changed = true;
      }
    }

    // 猶予タイマーが走っているが着席していないユーザーのタイマーをクリア
    for (const uid of graceTimersRef.current.keys()) {
      if (!seatedIds.has(uid)) {
        clearGraceTimer(uid);
      }
    }

    for (const uid of forceLeaveTimersRef.current.keys()) {
      if (!seatedIds.has(uid)) {
        clearForceLeaveTimer(uid);
      }
    }

    if (changed) {
      setConnectionStatuses(new Map(statusesRef.current));
    }
  }, [seatsKey, getSeatedUserIds, clearAllTimersForUser, clearGraceTimer, clearForceLeaveTimer]);

  return { connectionStatuses };
}
