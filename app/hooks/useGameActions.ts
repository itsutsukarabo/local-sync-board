/**
 * ゲーム操作ハンドラフック
 * game/[id].tsx のイベントハンドラ・操作状態を集約
 */

import { useEffect, useCallback, useState, useRef } from "react";
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  joinGame,
  transferScore,
  joinSeat,
  joinFakeSeat,
  reseatFakePlayer,
  forceLeaveSeat,
  leaveSeat,
  rollbackTo,
  undoLast,
  saveSettlement,
  fetchSettlements,
} from "../lib/roomApi";
import { supabase } from "../lib/supabase";
import {
  canExecuteSettlement,
  executeSettlement,
} from "../utils/settlementUtils";
import { Room, User } from "../types";

// ── インターフェース ──

export interface UseGameActionsParams {
  room: Room | null;
  user: User | null;
  isHost: boolean;
  showToast: (type: "success" | "error", msg: string) => void;
  applyRoom: (room: Room) => void;
}

export interface UseGameActionsResult {
  isProcessing: boolean;
  isJoining: boolean;
  joiningGuestSeats: Set<number>;
  settlementCount: number;
  handleJoinSeat: (seatIndex: number) => Promise<void>;
  handleJoinFakeSeat: (seatIndex: number) => Promise<void>;
  handleLeaveSeat: () => void;
  handleForceLeave: (targetUserId: string) => Promise<void>;
  handleTransfer: (
    fromId: string,
    toId: string,
    transfers: { variable: string; amount: number }[]
  ) => Promise<void>;
  handleRollback: (historyId: string) => Promise<void>;
  handleUndo: () => Promise<void>;
  handleSettlement: () => void;
  handleJoinGame: () => Promise<void>;
  handleLeaveGame: () => void;
  handleSettlementComplete: () => Promise<void>;
}

// ── フック本体 ──

export function useGameActions({
  room,
  user,
  isHost,
  showToast,
  applyRoom,
}: UseGameActionsParams): UseGameActionsResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joiningGuestSeats, setJoiningGuestSeats] = useState<Set<number>>(new Set());
  const guestSeatQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [settlementCount, setSettlementCount] = useState(0);

  // 精算件数を取得（room更新時に再取得）
  const latestLogId = room?.current_state?.__recent_log__?.slice(-1)?.[0]?.id;
  useEffect(() => {
    if (!room?.id) return;
    fetchSettlements(room.id).then(({ settlements }) => {
      setSettlementCount(settlements.length);
    });
  }, [room?.id, latestLogId]);

  // 精算完了時にカウントを更新
  const handleSettlementComplete = useCallback(async () => {
    if (!room?.id) return;
    const { settlements } = await fetchSettlements(room.id);
    setSettlementCount(settlements.length);
  }, [room?.id]);

  // 座席に着席するハンドラー（グローバルロック）
  const handleJoinSeat = useCallback(
    async (seatIndex: number) => {
      if (!room || !user || isJoining) return;
      setIsJoining(true);

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      try {
        const { room: updatedRoom, error } = await joinSeat(room.id, seatIndex);
        if (error) {
          Alert.alert("エラー", error.message);
        } else if (updatedRoom) {
          applyRoom(updatedRoom);
        }
      } catch (error) {
        console.error("Error joining seat:", error);
        Alert.alert("エラー", "座席への着席に失敗しました");
      } finally {
        setIsJoining(false);
      }
    },
    [room, user, isJoining, applyRoom]
  );

  // ゲストを座席に着席させるハンドラー（per-seat スピナー + キュー直列化）
  const handleJoinFakeSeat = useCallback(
    async (seatIndex: number) => {
      if (!room || !user || joiningGuestSeats.has(seatIndex)) return;

      // 押した席だけ即座にスピナー表示
      setJoiningGuestSeats((prev) => new Set(prev).add(seatIndex));

      const roomId = room.id;
      const previousTail = guestSeatQueueRef.current;

      // 前のゲスト着席 API 完了後に自分の処理を実行
      const myTask = previousTail.then(async () => {
        try {
          // 離席済みゲスト（current_stateにいるがseatsにいないfake_*）を検索
          const seatedFakeIds = new Set(
            (room.seats || [])
              .filter((s) => s?.isFake && s.userId)
              .map((s) => s!.userId)
          );
          const unseatedFakes = Object.keys(room.current_state || {}).filter(
            (id) => id.startsWith("fake_") && !seatedFakeIds.has(id)
          );

          if (unseatedFakes.length === 0) {
            const { room: updatedRoom, error } = await joinFakeSeat(roomId, seatIndex);
            if (error) Alert.alert("エラー", error.message);
            else if (updatedRoom) applyRoom(updatedRoom);
            return;
          }

          // 離席済みゲストがいる場合は選択UIを表示
          // Alert は同期なのでキュータスクは即完了（Alert 内 onPress は別フロー）
          const buttons: any[] = unseatedFakes.map((fakeId) => {
            const playerState = room.current_state[fakeId];
            const score = playerState?.score ?? 0;
            const guestName = playerState?.__displayName__ || fakeId;
            return {
              text: `${guestName} (点数: ${score.toLocaleString()})`,
              onPress: async () => {
                const { room: updatedRoom, error } = await reseatFakePlayer(roomId, fakeId, seatIndex);
                if (error) Alert.alert("エラー", error.message);
                else if (updatedRoom) applyRoom(updatedRoom);
              },
            };
          });

          buttons.push({
            text: "新規作成",
            onPress: async () => {
              const { room: updatedRoom, error } = await joinFakeSeat(roomId, seatIndex);
              if (error) Alert.alert("エラー", error.message);
              else if (updatedRoom) applyRoom(updatedRoom);
            },
          });
          buttons.push({ text: "キャンセル", style: "cancel" as const });

          Alert.alert(
            "ゲストを選択",
            "既存のゲストを再着席させるか、新規作成しますか？",
            buttons
          );
        } catch (err) {
          console.error("Error joining fake seat:", err);
          Alert.alert("エラー", "ゲストの着席に失敗しました");
        } finally {
          setJoiningGuestSeats((prev) => {
            const s = new Set(prev);
            s.delete(seatIndex);
            return s;
          });
        }
      });

      guestSeatQueueRef.current = myTask.catch(() => {});
      await myTask;
    },
    [room, user, joiningGuestSeats, applyRoom]
  );

  // 実ユーザーを強制離席させるハンドラー（ホスト操作）
  const handleForceLeave = useCallback(
    async (targetUserId: string) => {
      if (!room) return;

      try {
        const { error } = await forceLeaveSeat(room.id, targetUserId);
        if (error) {
          Alert.alert("エラー", error.message);
        }
      } catch (error) {
        console.error("Error force leaving seat:", error);
        Alert.alert("エラー", "強制離席に失敗しました");
      }
    },
    [room]
  );

  // 座席から離席するハンドラー
  const handleLeaveSeat = useCallback(() => {
    if (!room || !user) return;

    Alert.alert("確認", "座席から離席しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "離席",
        style: "destructive",
        onPress: async () => {
          try {
            const { room: updatedRoom, error } = await leaveSeat(room.id);
            if (error) {
              Alert.alert("エラー", error.message);
            } else if (updatedRoom) {
              applyRoom(updatedRoom);
            }
          } catch (error) {
            console.error("Error leaving seat:", error);
            Alert.alert("エラー", "座席からの離席に失敗しました");
          }
        },
      },
    ]);
  }, [room, user, applyRoom]);

  // スコア移動ハンドラー
  const handleTransfer = useCallback(
    async (
      fromId: string,
      toId: string,
      transfers: { variable: string; amount: number }[]
    ) => {
      if (!room || isProcessing) return;
      if (fromId === toId) return;
      setIsProcessing(true);

      const getDisplayName = (id: string): string | undefined => {
        if (id === "__pot__") return undefined;
        const seat = room.seats?.find((s) => s?.userId === id);
        return seat?.displayName;
      };
      const fromName = getDisplayName(fromId);
      const toName = getDisplayName(toId);

      try {
        const { error } = await transferScore(
          room.id,
          fromId,
          toId,
          transfers,
          fromName,
          toName
        );

        if (error) {
          showToast("error", error.message);
          return;
        }

        showToast("success", "支払いが完了しました");
      } catch (error) {
        console.error("Error transferring score:", error);
        showToast("error", "スコアの移動に失敗しました");
      } finally {
        setIsProcessing(false);
      }
    },
    [room, isProcessing, showToast]
  );

  // ロールバックハンドラー
  const handleRollback = useCallback(
    async (historyId: string) => {
      if (!room) return;

      try {
        const { error } = await rollbackTo(room.id, historyId);
        if (error) {
          showToast("error", error.message);
        }
      } catch (error) {
        console.error("Error rolling back:", error);
        showToast("error", "ロールバックに失敗しました");
      }
    },
    [room, showToast]
  );

  // Undoハンドラー
  const handleUndo = useCallback(async () => {
    if (!room) return;

    try {
      const { error } = await undoLast(room.id);
      if (error) {
        showToast("error", error.message);
      }
    } catch (error) {
      console.error("Error undoing:", error);
      showToast("error", "取り消しに失敗しました");
    }
  }, [room, showToast]);

  // 精算ハンドラー
  const handleSettlement = useCallback(() => {
    if (!room) return;

    const { canExecute, reason } = canExecuteSettlement(
      room.current_state,
      room.seats || [null, null, null, null],
      room.template.variables
    );

    if (!canExecute) {
      Alert.alert("精算不可", reason || "精算を実行できません");
      return;
    }

    Alert.alert(
      "確認",
      "半荘の精算を実行しますか？\nスコアは初期値にリセットされます。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "精算実行",
          onPress: async () => {
            try {
              const config = room.template.settlementConfig;
              if (!config) {
                Alert.alert("エラー", "精算設定がありません");
                return;
              }

              const settlement = executeSettlement(
                room.current_state,
                room.seats || [null, null, null, null],
                config,
                room.template.variables
              );

              const { error } = await saveSettlement(room.id, settlement);

              if (error) {
                showToast("error", error.message);
                return;
              }

              showToast("success", "精算が完了しました");
              await handleSettlementComplete();
            } catch (error) {
              console.error("Error executing settlement:", error);
              showToast("error", "精算の実行に失敗しました");
            }
          },
        },
      ]
    );
  }, [room, showToast, handleSettlementComplete]);

  // ゲーム参加ハンドラー（リストモード用）
  const handleJoinGame = useCallback(async () => {
    if (!room || !user) return;

    try {
      const { error } = await joinGame(room.id);
      if (error) {
        Alert.alert("エラー", error.message);
      }
    } catch (error) {
      console.error("Error joining game:", error);
      Alert.alert("エラー", "ゲームへの参加に失敗しました");
    }
  }, [room, user]);

  // ゲーム退出ハンドラー
  const handleLeaveGame = useCallback(() => {
    if (!room || !user) return;

    Alert.alert("確認", "ゲームから退出しますか？\n（ルームには残ります）", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "退出",
        style: "destructive",
        onPress: async () => {
          try {
            const currentState = { ...room.current_state };
            delete currentState[user.id];

            const { error } = await supabase
              .from("rooms")
              .update({ current_state: currentState })
              .eq("id", room.id);

            if (error) {
              throw error;
            }
          } catch (error) {
            console.error("Error leaving game:", error);
            Alert.alert("エラー", "ゲームからの退出に失敗しました");
          }
        },
      },
    ]);
  }, [room, user]);

  return {
    isProcessing,
    isJoining,
    joiningGuestSeats,
    settlementCount,
    handleJoinSeat,
    handleJoinFakeSeat,
    handleLeaveSeat,
    handleForceLeave,
    handleTransfer,
    handleRollback,
    handleUndo,
    handleSettlement,
    handleJoinGame,
    handleLeaveGame,
    handleSettlementComplete,
  };
}
