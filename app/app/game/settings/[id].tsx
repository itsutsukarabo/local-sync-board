/**
 * ルーム設定画面 (Host専用)
 * テンプレートのカスタマイズ、プレイヤー管理、リセット機能
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRoomRealtime } from "../../../hooks/useRoomRealtime";
import { useAuth } from "../../../hooks/useAuth";

export default function RoomSettingsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { room, loading, error } = useRoomRealtime(id);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>ルームが見つかりません</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isHost = user?.id === room.host_user_id;

  // ホスト以外はアクセス不可
  if (!isHost) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>
            この画面はホストのみアクセスできます
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // プレイヤー一覧を取得
  const players = Object.keys(room.current_state || {}).filter(
    (key) => !key.startsWith("__")
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBack}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ルーム設定</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 変数設定セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>変数設定</Text>
          <Text style={styles.sectionDescription}>
            ゲームで使用する変数の追加・編集ができます
          </Text>
          {room.template.variables.map((variable) => (
            <View key={variable.key} style={styles.listItem}>
              <Text style={styles.listItemLabel}>{variable.label}</Text>
              <Text style={styles.listItemValue}>
                初期値: {variable.initial.toLocaleString()}
              </Text>
            </View>
          ))}
          <Text style={styles.placeholder}>
            (Task 3.5-4で編集UI実装予定)
          </Text>
        </View>

        {/* 供託操作セクション */}
        {room.template.potEnabled && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>供託操作</Text>
            <Text style={styles.sectionDescription}>
              供託に入れる操作の定義を管理します
            </Text>
            {(room.template.potActions || []).map((action) => (
              <View key={action.id} style={styles.listItem}>
                <Text style={styles.listItemLabel}>{action.label}</Text>
                <Text style={styles.listItemValue}>
                  -{action.amount.toLocaleString()} ({action.variable})
                </Text>
              </View>
            ))}
            <Text style={styles.placeholder}>
              (Task 3.5-4で編集UI実装予定)
            </Text>
          </View>
        )}

        {/* プレイヤー管理セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>プレイヤー管理</Text>
          <Text style={styles.sectionDescription}>
            各プレイヤーのスコアを確認・編集できます
          </Text>
          {players.length === 0 ? (
            <Text style={styles.emptyText}>参加中のプレイヤーはいません</Text>
          ) : (
            players.map((playerId) => {
              const playerState = room.current_state[playerId];
              return (
                <View key={playerId} style={styles.listItem}>
                  <Text style={styles.listItemLabel}>
                    {playerId === user?.id
                      ? `${playerId.substring(0, 8)}... (あなた)`
                      : `${playerId.substring(0, 8)}...`}
                  </Text>
                  <Text style={styles.listItemValue}>
                    {room.template.variables
                      .map(
                        (v) =>
                          `${v.label}: ${((playerState?.[v.key] as number) || 0).toLocaleString()}`
                      )
                      .join(" / ")}
                  </Text>
                </View>
              );
            })
          )}
          <Text style={styles.placeholder}>
            (Task 3.5-6で編集UI実装予定)
          </Text>
        </View>

        {/* リセットセクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>リセット</Text>
          <Text style={styles.sectionDescription}>
            選択した変数を全プレイヤーで初期値に戻します
          </Text>
          <Text style={styles.placeholder}>
            (Task 3.5-7で実装予定)
          </Text>
        </View>
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
    fontSize: 16,
    color: "#ef4444",
    marginBottom: 16,
    textAlign: "center",
  },
  backBtn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
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
  headerBack: {
    fontSize: 16,
    color: "#3b82f6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  headerSpacer: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 12,
  },
  listItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  listItemLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
    flexShrink: 1,
  },
  listItemValue: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 12,
  },
  placeholder: {
    fontSize: 12,
    color: "#9ca3af",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
  },
});
