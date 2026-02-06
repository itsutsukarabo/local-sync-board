/**
 * ゲーム画面 (S-02: Game Board)
 * ルームのリアルタイム同期とプレイヤー一覧表示
 */

import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRoomRealtime } from "../../hooks/useRoomRealtime";
import { useConnectionMonitor } from "../../hooks/useConnectionMonitor";
import { useAuth } from "../../hooks/useAuth";
import PlayerList from "../../components/game/PlayerList";
import MahjongTable from "../../components/game/MahjongTable";
import HistoryLog from "../../components/game/HistoryLog";
import {
  joinRoom,
  joinGame,
  leaveRoom,
  updateRoomStatus,
  transferScore,
  joinSeat,
  leaveSeat,
  rollbackTo,
  undoLast,
} from "../../lib/roomApi";
import { HistoryEntry } from "../../types";
import { supabase } from "../../lib/supabase";

export default function GameScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { room, loading, error, refetch } = useRoomRealtime(id);
  const { connectionStatuses } = useConnectionMonitor(
    id ?? null,
    user?.id ?? null,
    room?.seats ?? [null, null, null, null],
    room?.template?.forceLeaveTimeoutSec,
  );

  console.log("[GameScreen render]", { id, loading, hasRoom: !!room, hasError: !!error, hasUser: !!user });

  // エラーハンドリング
  useEffect(() => {
    if (error) {
      Alert.alert("エラー", error.message, [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    }
  }, [error]);

  // ユーザーが座席に座っているかチェック（フック依存のため早期リターン前に計算）
  const isUserSeated =
    room?.seats?.some((seat) => seat && seat.userId === user?.id) || false;

  // 戻るボタンハンドラー（着席中なら離席確認ダイアログ表示）
  const handleBack = useCallback(() => {
    if (isUserSeated && room) {
      Alert.alert(
        "部屋を離れますか？",
        "離席して部屋を出ます。\nデータは保持されます。",
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "離席して戻る",
            style: "destructive",
            onPress: async () => {
              try {
                const { error } = await leaveSeat(room.id);
                if (error) {
                  Alert.alert("エラー", error.message);
                  return;
                }
              } catch (error) {
                console.error("Error leaving seat on back:", error);
                Alert.alert("エラー", "離席に失敗しました");
                return;
              }
              router.back();
            },
          },
        ]
      );
      return true;
    } else {
      router.back();
      return true;
    }
  }, [isUserSeated, room, router]);

  // Androidハードウェアバックボタン対応
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => subscription.remove();
  }, [handleBack]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>ルームを読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>ルームが見つかりません</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isHost = user?.id === room.host_user_id;
  // 予約キー（__pot__, __history__）を除外してプレイヤーリストを取得
  const players = Object.keys(room.current_state || {}).filter(
    (id) => !id.startsWith("__")
  );
  const playerCount = players.length;
  const isUserInGame = user?.id ? players.includes(user.id) : false;

  // レイアウトモードを取得
  const layoutMode = room.template.layoutMode || "list";
  const isPotEnabled = room.template.potEnabled || false;

  // ゲーム開始ハンドラー
  const handleStartGame = () => {
    if (!room) return;

    // プレイヤーが1人以上いるかチェック
    const playerCount = Object.keys(room.current_state || {}).length;
    if (playerCount === 0) {
      Alert.alert(
        "エラー",
        "ゲームを開始するには、少なくとも1人のプレイヤーが必要です"
      );
      return;
    }

    Alert.alert("確認", "ゲームを開始しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "開始",
        onPress: async () => {
          try {
            // ルームのステータスを"playing"に更新
            const { error } = await updateRoomStatus(room.id, "playing");

            if (error) {
              Alert.alert("エラー", error.message);
              return;
            }

            Alert.alert("成功", "ゲームが開始されました！");
          } catch (error) {
            console.error("Error starting game:", error);
            Alert.alert("エラー", "ゲームの開始に失敗しました");
          }
        },
      },
    ]);
  };

  // ゲーム終了ハンドラー
  const handleEndGame = () => {
    if (!room) return;

    Alert.alert("確認", "ゲームを終了しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "終了",
        style: "destructive",
        onPress: async () => {
          try {
            // ルームのステータスを"finished"に更新
            const { error } = await updateRoomStatus(room.id, "finished");

            if (error) {
              Alert.alert("エラー", error.message);
              return;
            }

            Alert.alert("成功", "ゲームが終了しました");
          } catch (error) {
            console.error("Error ending game:", error);
            Alert.alert("エラー", "ゲームの終了に失敗しました");
          }
        },
      },
    ]);
  };

  // ゲーム参加ハンドラー（リストモード用）
  const handleJoinGame = async () => {
    if (!room || !user) return;

    try {
      // joinGame関数を使用してゲームに参加（current_stateにプレイヤーを追加）
      const { error } = await joinGame(room.id);

      if (error) {
        Alert.alert("エラー", error.message);
        return;
      }

      // 操作元クライアントのUIを確実に更新するため手動で再取得
      await refetch();

    } catch (error) {
      console.error("Error joining game:", error);
      Alert.alert("エラー", "ゲームへの参加に失敗しました");
    }
  };

  // ゲーム退出ハンドラー
  const handleLeaveGame = async () => {
    if (!room || !user) return;

    Alert.alert("確認", "ゲームから退出しますか？\n（ルームには残ります）", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "退出",
        style: "destructive",
        onPress: async () => {
          try {
            // current_stateから自分を削除
            const currentState = { ...room.current_state };
            delete currentState[user.id];

            const { error } = await supabase
              .from("rooms")
              .update({ current_state: currentState })
              .eq("id", room.id);

            if (error) {
              throw error;
            }

            // 操作元クライアントのUIを確実に更新するため手動で再取得
            await refetch();

          } catch (error) {
            console.error("Error leaving game:", error);
            Alert.alert("エラー", "ゲームからの退出に失敗しました");
          }
        },
      },
    ]);
  };

  // スコア移動ハンドラー
  const handleTransfer = async (
    fromId: string,
    toId: string,
    transfers: { variable: string; amount: number }[]
  ) => {
    if (!room) return;

    // 履歴ログ用に表示名を取得
    const getDisplayName = (id: string): string | undefined => {
      if (id === "__pot__") return undefined; // 供託は名前不要（roomApi側で処理）
      const seat = room.seats?.find((s) => s?.userId === id);
      return seat?.displayName;
    };
    const fromName = getDisplayName(fromId);
    const toName = getDisplayName(toId);

    try {
      const { error } = await transferScore(room.id, fromId, toId, transfers, fromName, toName);

      if (error) {
        Alert.alert("エラー", error.message);
        return;
      }

      // 操作元クライアントのUIを確実に更新するため手動で再取得
      await refetch();

    } catch (error) {
      console.error("Error transferring score:", error);
      Alert.alert("エラー", "スコアの移動に失敗しました");
    }
  };

  // 座席に着席するハンドラー
  const handleJoinSeat = async (seatIndex: number) => {
    if (!room || !user) return;

    try {
      const { error } = await joinSeat(room.id, seatIndex);

      if (error) {
        Alert.alert("エラー", error.message);
        return;
      }

      // 操作元クライアントのUIを確実に更新するため手動で再取得
      await refetch();

    } catch (error) {
      console.error("Error joining seat:", error);
      Alert.alert("エラー", "座席への着席に失敗しました");
    }
  };

  // 座席から離席するハンドラー
  const handleLeaveSeat = async () => {
    if (!room || !user) return;

    Alert.alert("確認", "座席から離席しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "離席",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await leaveSeat(room.id);

            if (error) {
              Alert.alert("エラー", error.message);
              return;
            }

            // 操作元クライアントのUIを確実に更新するため手動で再取得
            await refetch();

          } catch (error) {
            console.error("Error leaving seat:", error);
            Alert.alert("エラー", "座席からの離席に失敗しました");
          }
        },
      },
    ]);
  };

  // ロールバックハンドラー
  const handleRollback = async (historyId: string) => {
    if (!room) return;

    try {
      const { error } = await rollbackTo(room.id, historyId);

      if (error) {
        Alert.alert("エラー", error.message);
        return;
      }

      await refetch();

    } catch (error) {
      console.error("Error rolling back:", error);
      Alert.alert("エラー", "ロールバックに失敗しました");
    }
  };

  // Undoハンドラー
  const handleUndo = async () => {
    if (!room) return;

    try {
      const { error } = await undoLast(room.id);

      if (error) {
        Alert.alert("エラー", error.message);
        return;
      }

      await refetch();

    } catch (error) {
      console.error("Error undoing:", error);
      Alert.alert("エラー", "取り消しに失敗しました");
    }
  };

  // 履歴を取得
  const history: HistoryEntry[] = room?.current_state?.__history__ || [];

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>← 戻る</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.roomCode}>ルーム: {room.room_code}</Text>
          <Text style={styles.playerCount}>{playerCount}人参加中</Text>
        </View>
        <View style={styles.headerRight}>
          {isHost && (
            <TouchableOpacity
              onPress={() => router.push(`/game/settings/${room.id}`)}
            >
              <Text style={styles.settingsButton}>⚙️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ステータスバッジ */}
      <View style={styles.statusContainer}>
        <View
          style={[
            styles.statusBadge,
            room.status === "waiting" && styles.statusWaiting,
            room.status === "playing" && styles.statusPlaying,
            room.status === "finished" && styles.statusFinished,
          ]}
        >
          <Text style={styles.statusText}>
            {room.status === "waiting" && "募集中"}
            {room.status === "playing" && "プレイ中"}
            {room.status === "finished" && "終了"}
          </Text>
        </View>
      </View>

      {/* 履歴ログ */}
      <HistoryLog
        history={history}
        onRollback={handleRollback}
        onUndo={handleUndo}
        isHost={isHost}
      />

      {/* メインコンテンツ */}
      {layoutMode === "mahjong" ? (
        // 麻雀モード: スクロール可能なレイアウト + 座席選択システム
        <ScrollView
          style={styles.mahjongScrollView}
          contentContainerStyle={styles.mahjongScrollContent}
        >
          {/* 離席ボタン（座席に座っている場合のみ表示） */}
          {user && isUserSeated && (
            <View style={styles.mahjongParticipationSection}>
              <TouchableOpacity
                style={styles.mahjongLeaveButton}
                onPress={handleLeaveSeat}
              >
                <Text style={styles.mahjongLeaveButtonText}>
                  🚪 座席から離席
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 麻雀テーブル（固定サイズ） */}
          <View style={styles.mahjongTableWrapper}>
            <MahjongTable
              gameState={room.current_state || {}}
              variables={room.template.variables}
              currentUserId={user?.id || ""}
              hostUserId={room.host_user_id}
              seats={room.seats || [null, null, null, null]}
              onTransfer={handleTransfer}
              onJoinSeat={handleJoinSeat}
              isPotEnabled={isPotEnabled}
              potActions={room.template.potActions || []}
              connectionStatuses={connectionStatuses}
            />
          </View>

          {/* ホスト専用コントロール（麻雀モード） */}
          {isHost && (
            <View style={styles.mahjongHostControls}>
              <Text style={styles.sectionTitle}>ホストコントロール</Text>
              {room.status === "waiting" && (
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={handleStartGame}
                >
                  <Text style={styles.controlButtonText}>ゲーム開始</Text>
                </TouchableOpacity>
              )}
              {room.status === "playing" && (
                <TouchableOpacity
                  style={[styles.controlButton, styles.controlButtonDanger]}
                  onPress={handleEndGame}
                >
                  <Text style={styles.controlButtonText}>ゲーム終了</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        // リストモード: スクロール可能なリスト
        <ScrollView style={styles.content}>
          {/* ゲーム参加/退出ボタン */}
          {user && (
            <View style={styles.participationSection}>
              {!isUserInGame ? (
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={handleJoinGame}
                >
                  <Text style={styles.joinButtonText}>🎮 ゲームに参加</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.leaveButton}
                  onPress={handleLeaveGame}
                >
                  <Text style={styles.leaveButtonText}>🚪 ゲームから退出</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <PlayerList
            gameState={room.current_state || {}}
            variables={room.template.variables}
            currentUserId={user?.id}
            hostUserId={room.host_user_id}
          />

          {/* ホスト専用コントロール */}
          {isHost && (
            <View style={styles.hostControls}>
              <Text style={styles.sectionTitle}>ホストコントロール</Text>
              {room.status === "waiting" && (
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={handleStartGame}
                >
                  <Text style={styles.controlButtonText}>ゲーム開始</Text>
                </TouchableOpacity>
              )}
              {room.status === "playing" && (
                <TouchableOpacity
                  style={[styles.controlButton, styles.controlButtonDanger]}
                  onPress={handleEndGame}
                >
                  <Text style={styles.controlButtonText}>ゲーム終了</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6b7280",
  },
  errorText: {
    fontSize: 18,
    color: "#ef4444",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerLeft: {
    flex: 1,
  },
  headerCenter: {
    flex: 2,
    alignItems: "center",
  },
  headerRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  backButton: {
    fontSize: 16,
    color: "#3b82f6",
  },
  roomCode: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  playerCount: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  settingsButton: {
    fontSize: 24,
  },
  statusContainer: {
    padding: 16,
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  statusWaiting: {
    backgroundColor: "#dbeafe",
  },
  statusPlaying: {
    backgroundColor: "#dcfce7",
  },
  statusFinished: {
    backgroundColor: "#f3f4f6",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  mahjongScrollView: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  mahjongScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  mahjongTableWrapper: {
    minHeight: 400,
  },
  mahjongParticipationSection: {
    padding: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  mahjongHostControls: {
    padding: 16,
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  mahjongJoinButton: {
    backgroundColor: "#10b981",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  mahjongJoinButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  mahjongLeaveButton: {
    backgroundColor: "#f59e0b",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  mahjongLeaveButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 12,
  },
  participationSection: {
    marginBottom: 16,
  },
  joinButton: {
    backgroundColor: "#10b981",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  joinButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  leaveButton: {
    backgroundColor: "#f59e0b",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  leaveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  hostControls: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  controlButton: {
    backgroundColor: "#10b981",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  controlButtonDanger: {
    backgroundColor: "#ef4444",
  },
  controlButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
