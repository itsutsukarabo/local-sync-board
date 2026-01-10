/**
 * ゲーム画面 (S-02: Game Board)
 * ルームのリアルタイム同期とプレイヤー一覧表示
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRoomRealtime } from "../../hooks/useRoomRealtime";
import { useAuth } from "../../hooks/useAuth";

export default function GameScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { room, loading, error } = useRoomRealtime(id);
  const [showSettings, setShowSettings] = useState(false);

  // ホストの場合、初回のみ設定モーダルを表示
  useEffect(() => {
    if (room && user && room.host_user_id === user.id) {
      // TODO: 初回のみ表示するロジック（localStorage等で管理）
      // setShowSettings(true);
    }
  }, [room, user]);

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
  const players = Object.keys(room.current_state || {});
  const playerCount = players.length;

  // デバッグログ
  console.log("Game screen - Room:", room.id);
  console.log("Game screen - Current state:", room.current_state);
  console.log("Game screen - Players:", players);
  console.log("Game screen - Player count:", playerCount);
  console.log("Game screen - Current user:", user?.id);

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← 戻る</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.roomCode}>ルーム: {room.room_code}</Text>
          <Text style={styles.playerCount}>{playerCount}人参加中</Text>
        </View>
        <View style={styles.headerRight}>
          {isHost && (
            <TouchableOpacity onPress={() => setShowSettings(!showSettings)}>
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

      {/* プレイヤー一覧 */}
      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>プレイヤー</Text>

        {playerCount === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>まだプレイヤーがいません</Text>
            <Text style={styles.emptySubtext}>
              ルームコードを共有して参加を待ちましょう
            </Text>
          </View>
        ) : (
          <View style={styles.playerList}>
            {players.map((playerId) => {
              const playerState = room.current_state[playerId];
              return (
                <View key={playerId} style={styles.playerCard}>
                  <View style={styles.playerHeader}>
                    <Text style={styles.playerName}>
                      {playerId === user?.id
                        ? "あなた"
                        : `プレイヤー ${playerId.slice(0, 8)}`}
                      {playerId === room.host_user_id && " 👑"}
                    </Text>
                  </View>
                  <View style={styles.playerStats}>
                    {room.template.variables.map((variable) => (
                      <View key={variable.key} style={styles.statItem}>
                        <Text style={styles.statLabel}>{variable.label}</Text>
                        <Text style={styles.statValue}>
                          {playerState[variable.key] ?? variable.initial}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* アクションボタン（プレイ中のみ） */}
        {room.status === "playing" && (
          <View style={styles.actionSection}>
            <Text style={styles.sectionTitle}>アクション</Text>
            <View style={styles.actionButtons}>
              {room.template.actions.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.actionButton}
                  onPress={() => {
                    // TODO: アクション実行処理
                    Alert.alert("アクション", `${action.label} を実行`);
                  }}
                >
                  <Text style={styles.actionButtonText}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ホスト専用コントロール */}
        {isHost && (
          <View style={styles.hostControls}>
            <Text style={styles.sectionTitle}>ホストコントロール</Text>
            {room.status === "waiting" && (
              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => {
                  // TODO: ゲーム開始処理
                  Alert.alert("確認", "ゲームを開始しますか？");
                }}
              >
                <Text style={styles.controlButtonText}>ゲーム開始</Text>
              </TouchableOpacity>
            )}
            {room.status === "playing" && (
              <TouchableOpacity
                style={[styles.controlButton, styles.controlButtonDanger]}
                onPress={() => {
                  // TODO: ゲーム終了処理
                  Alert.alert("確認", "ゲームを終了しますか？");
                }}
              >
                <Text style={styles.controlButtonText}>ゲーム終了</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 12,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
  playerList: {
    gap: 12,
  },
  playerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  playerHeader: {
    marginBottom: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  playerStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: 100,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
  },
  actionSection: {
    marginTop: 24,
  },
  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 14,
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
