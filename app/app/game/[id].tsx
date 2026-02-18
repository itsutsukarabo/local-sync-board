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
import { useGameActions } from "../../hooks/useGameActions";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import PlayerList from "../../components/game/PlayerList";
import MahjongTable from "../../components/game/MahjongTable";
import HistoryLog from "../../components/game/HistoryLog";
import Toast from "../../components/common/Toast";
import { useToast } from "../../hooks/useToast";
import { leaveSeat } from "../../lib/roomApi";
import { RecentLogEntry } from "../../types";

export default function GameScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { room, loading, error, refetch, isRealtimeDisconnected, isReconnected } = useRoomRealtime(id);
  const { connectionStatuses } = useConnectionMonitor(
    id ?? null,
    user?.id ?? null,
    room?.seats ?? [null, null, null, null],
    room?.template?.forceLeaveTimeoutSec,
  );

  const isHost = user?.id === room?.host_user_id;
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  const {
    isProcessing,
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
  } = useGameActions({ room, user, isHost, showToast });

  // エラーハンドリング: 永続的エラーと一時的エラーを分類
  useEffect(() => {
    if (!error) return;

    const permanentErrors = ["ルームが削除されました", "ルームが見つかりません"];
    const isPermanent = permanentErrors.some((msg) => error.message.includes(msg));

    if (isPermanent) {
      Alert.alert("エラー", error.message, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Alert.alert("通信エラー", error.message, [
        {
          text: "リトライ",
          onPress: () => {
            refetch();
          },
        },
        {
          text: "戻る",
          onPress: () => router.back(),
          style: "cancel",
        },
      ]);
    }
  }, [error]);

  // ユーザーが座席に座っているかチェック
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
          <TouchableOpacity style={styles.button} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
            <Text style={styles.buttonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 予約キー（__pot__, __recent_log__）を除外してプレイヤーリストを取得
  const players = Object.keys(room.current_state || {}).filter(
    (id) => !id.startsWith("__")
  );
  const playerCount = players.length;
  const isUserInGame = user?.id ? players.includes(user.id) : false;

  // レイアウトモードを取得
  const layoutMode = room.template.layoutMode || "list";
  const isPotEnabled = room.template.potEnabled || false;

  // 直近の操作ログを取得（プレビュー用）
  const recentLog: RecentLogEntry[] = room?.current_state?.__recent_log__ || [];

  // 右スワイプで精算履歴ページに遷移
  const swipeGesture = Gesture.Pan()
    .activeOffsetX(30)
    .onEnd((event) => {
      if (event.translationX > 50) {
        router.push(`/game/settlement/${room.id}`);
      }
    })
    .runOnJS(true);

  return (
    <GestureDetector gesture={swipeGesture}>
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

      {/* 接続警告バナー */}
      {isRealtimeDisconnected && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionBannerText}>
            サーバーとの接続が不安定です。自動再接続を試みています...
          </Text>
        </View>
      )}
      {/* 再接続成功バナー */}
      {isReconnected && !isRealtimeDisconnected && (
        <View style={styles.reconnectedBanner}>
          <Text style={styles.reconnectedBannerText}>
            再接続しました！
          </Text>
        </View>
      )}

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
              onJoinFakeSeat={isHost ? handleJoinFakeSeat : undefined}
              onForceLeave={isHost ? handleForceLeave : undefined}
              isPotEnabled={isPotEnabled}
              potActions={room.template.potActions || []}
              connectionStatuses={connectionStatuses}
              isProcessing={isProcessing}
            />
          </View>

          {/* ホスト専用コントロール（麻雀モード） */}
          {isHost && room.template.settlementConfig && (
            <View style={styles.mahjongHostControls}>
              <Text style={styles.sectionTitle}>ホストコントロール</Text>
              <TouchableOpacity
                style={[styles.controlButton, styles.controlButtonSettlement]}
                onPress={handleSettlement}
              >
                <Text style={styles.controlButtonText}>📊 精算</Text>
              </TouchableOpacity>
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
          {isHost && room.template.settlementConfig && (
            <View style={styles.hostControls}>
              <Text style={styles.sectionTitle}>ホストコントロール</Text>
              <TouchableOpacity
                style={[styles.controlButton, styles.controlButtonSettlement]}
                onPress={handleSettlement}
              >
                <Text style={styles.controlButtonText}>📊 精算</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* 履歴ログ */}
      <HistoryLog
        recentLog={recentLog}
        roomId={room.id}
        onRollback={handleRollback}
        onUndo={handleUndo}
        isHost={isHost}
        settlementCount={settlementCount}
      />
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </SafeAreaView>
    </GestureDetector>
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
  connectionBanner: {
    backgroundColor: "#fef3c7",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#fcd34d",
  },
  connectionBannerText: {
    fontSize: 13,
    color: "#92400e",
    textAlign: "center",
  },
  reconnectedBanner: {
    backgroundColor: "#d1fae5",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#6ee7b7",
  },
  reconnectedBannerText: {
    fontSize: 13,
    color: "#065f46",
    textAlign: "center",
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
  controlButtonSettlement: {
    backgroundColor: "#8b5cf6",
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
