/**
 * ルーム設定画面 (Host専用)
 * テンプレートのカスタマイズ、プレイヤー管理、リセット機能
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRoomRealtime } from "../../../hooks/useRoomRealtime";
import { useAuth } from "../../../hooks/useAuth";
import { updateTemplate, updateRoomName } from "../../../lib/roomApi";
import { updateRecentRoomName } from "../../../lib/recentRooms";
import { Variable, PotAction, SettlementConfig } from "../../../types";
import { isHostUser } from "../../../utils/roomUtils";
import { DEFAULT_FORCE_LEAVE_TIMEOUT_SEC } from "../../../constants/connection";
import VariableEditor from "../../../components/settings/VariableEditor";
import PotActionEditor from "../../../components/settings/PotActionEditor";
import SettlementConfigEditor from "../../../components/settings/SettlementConfigEditor";
import PlayerScoreEditor from "../../../components/settings/PlayerScoreEditor";
import ResetSection from "../../../components/settings/ResetSection";
import CoHostEditor from "../../../components/settings/CoHostEditor";

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
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
          >
            <Text style={styles.backBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isHost = isHostUser(user?.id, room);

  // ホスト以外はアクセス不可
  if (!isHost) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>
            この画面はホストのみアクセスできます
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.backBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return <SettingsContent room={room} user={user} router={router} />;
}

/**
 * 設定画面の本体（state管理をルーム取得後に行うため分離）
 */
function SettingsContent({
  room,
  user,
  router,
}: {
  room: any;
  user: any;
  router: any;
}) {
  const [editRoomName, setEditRoomName] = useState<string>(
    room.room_name ?? "",
  );
  const [editVariables, setEditVariables] = useState<Variable[]>(
    room.template.variables,
  );
  const [editPotActions, setEditPotActions] = useState<PotAction[]>(
    room.template.potActions || [],
  );
  const [editSettlementConfig, setEditSettlementConfig] = useState<
    SettlementConfig | undefined
  >(room.template.settlementConfig);
  const [editForceLeaveTimeout, setEditForceLeaveTimeout] = useState<string>(
    String(
      room.template.forceLeaveTimeoutSec ?? DEFAULT_FORCE_LEAVE_TIMEOUT_SEC,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // ルームデータが更新されたらローカルstateを同期
  useEffect(() => {
    setEditRoomName(room.room_name ?? "");
    setEditVariables(room.template.variables);
    setEditPotActions(room.template.potActions || []);
    setEditSettlementConfig(room.template.settlementConfig);
    setEditForceLeaveTimeout(
      String(
        room.template.forceLeaveTimeoutSec ?? DEFAULT_FORCE_LEAVE_TIMEOUT_SEC,
      ),
    );
    setHasChanges(false);
  }, [room.room_name, room.template]);

  const handleVariablesUpdate = useCallback((variables: Variable[]) => {
    setEditVariables(variables);
    setHasChanges(true);
  }, []);

  const handlePotActionsUpdate = useCallback((potActions: PotAction[]) => {
    setEditPotActions(potActions);
    setHasChanges(true);
  }, []);

  const handleSettlementConfigUpdate = useCallback(
    (config: SettlementConfig) => {
      setEditSettlementConfig(config);
      setHasChanges(true);
    },
    [],
  );

  const handleSave = async () => {
    const parsedTimeout = parseInt(editForceLeaveTimeout, 10);
    if (isNaN(parsedTimeout) || parsedTimeout < 60) {
      Alert.alert("エラー", "強制離席時間は60秒以上の値を入力してください");
      return;
    }
    setSaving(true);
    try {
      const trimmedRoomName = editRoomName.trim();
      if (trimmedRoomName !== (room.room_name ?? "")) {
        const { error: nameError } = await updateRoomName(
          room.id,
          trimmedRoomName,
        );
        if (nameError) {
          Alert.alert("エラー", nameError.message);
          setSaving(false);
          return;
        }
        await updateRecentRoomName(room.id, trimmedRoomName);
      }
      const { error } = await updateTemplate(room.id, {
        variables: editVariables,
        potActions: editPotActions,
        ...(editSettlementConfig
          ? { settlementConfig: editSettlementConfig }
          : {}),
        forceLeaveTimeoutSec: parsedTimeout,
      });
      if (error) {
        Alert.alert("エラー", error.message);
      } else {
        setHasChanges(false);
        Alert.alert("保存完了", "設定を更新しました。");
      }
    } finally {
      setSaving(false);
    }
  };

  // プレイヤー一覧を取得
  const players = Object.keys(room.current_state || {}).filter(
    (key) => !key.startsWith("__"),
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (hasChanges) {
              Alert.alert(
                "確認",
                "変更が保存されていません。保存せずに戻りますか？",
                [
                  { text: "キャンセル", style: "cancel" },
                  {
                    text: "保存せず戻る",
                    style: "destructive",
                    onPress: () => router.back(),
                  },
                ],
              );
            } else {
              router.back();
            }
          }}
        >
          <Text style={styles.headerBack}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ルーム設定</Text>
        <TouchableOpacity
          style={[
            styles.saveBtn,
            (!hasChanges || saving) && styles.saveBtnDisabled,
          ]}
          onPress={handleSave}
          disabled={!hasChanges || saving}
        >
          <Text style={styles.saveBtnText}>
            {saving ? "保存中..." : "保存"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ルーム名セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ルーム名</Text>
          <Text style={styles.sectionDescription}>
            ゲーム画面などに表示される部屋の名前です
          </Text>
          <TextInput
            style={styles.roomNameInput}
            value={editRoomName}
            onChangeText={(text) => {
              setEditRoomName(text);
              setHasChanges(true);
            }}
            placeholder="ルーム名を入力してください"
            maxLength={30}
          />
        </View>

        {/* 変数設定セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>変数設定</Text>
          <Text style={styles.sectionDescription}>
            ゲームで使用する変数の追加・編集ができます
          </Text>
          <VariableEditor
            variables={editVariables}
            potActions={editPotActions}
            onUpdate={handleVariablesUpdate}
          />
        </View>

        {/* 供託操作セクション */}
        {room.template.potEnabled && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>供託操作</Text>
            <Text style={styles.sectionDescription}>
              供託に入れる操作の定義を管理します
            </Text>
            <PotActionEditor
              potActions={editPotActions}
              variables={editVariables}
              onUpdate={handlePotActionsUpdate}
            />
          </View>
        )}

        {/* 精算設定セクション */}
        {editSettlementConfig && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>精算設定</Text>
            <Text style={styles.sectionDescription}>
              精算時の割る数・順位点を設定します
            </Text>
            <SettlementConfigEditor
              config={editSettlementConfig}
              onUpdate={handleSettlementConfigUpdate}
              scoreInitial={
                editVariables.find((v) => v.key === "score")?.initial ?? 0
              }
            />
          </View>
        )}

        {/* プレイヤー管理セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>プレイヤー管理</Text>
          <Text style={styles.sectionDescription}>
            各プレイヤーのスコアを確認・編集できます
          </Text>
          <PlayerScoreEditor
            roomId={room.id}
            players={players}
            currentState={room.current_state}
            variables={room.template.variables}
            currentUserId={user?.id}
            seats={room.seats || [null, null, null, null]}
          />
        </View>

        {/* ホスト権限管理 - 元の作成者のみ表示 */}
        {user?.id === room.host_user_id && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ホスト権限管理</Text>
            <Text style={styles.sectionDescription}>
              着席中のプレイヤーにホスト権限を付与・剥奪できます
            </Text>
            <CoHostEditor room={room} />
          </View>
        )}

        {/* 接続設定セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>接続設定</Text>
          <Text style={styles.sectionDescription}>
            切断検知後、指定時間経過で自動的に座席から離席されます
          </Text>
          <View style={styles.timeoutRow}>
            <Text style={styles.timeoutLabel}>強制離席時間</Text>
            <View style={styles.timeoutInputRow}>
              <TextInput
                style={styles.timeoutInput}
                value={editForceLeaveTimeout}
                onChangeText={(text) => {
                  setEditForceLeaveTimeout(text.replace(/[^0-9]/g, ""));
                  setHasChanges(true);
                }}
                keyboardType="number-pad"
                maxLength={5}
              />
              <Text style={styles.timeoutUnit}>秒</Text>
            </View>
          </View>
          <Text style={styles.timeoutHint}>
            {(() => {
              const sec = parseInt(editForceLeaveTimeout, 10);
              if (isNaN(sec)) return "数値を入力してください";
              if (sec < 60) return "60秒以上を指定してください";
              const m = Math.floor(sec / 60);
              const s = sec % 60;
              return `= ${m}分${s > 0 ? `${s}秒` : ""}`;
            })()}
          </Text>
        </View>

        {/* リセットセクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>リセット</Text>
          <Text style={styles.sectionDescription}>
            選択した変数を全プレイヤーで初期値に戻します
          </Text>
          <ResetSection
            roomId={room.id}
            variables={room.template.variables}
            potEnabled={room.template.potEnabled}
          />
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
  saveBtn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saveBtnDisabled: {
    backgroundColor: "#d1d5db",
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
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
  timeoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  timeoutLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },
  timeoutInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeoutInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    color: "#1f2937",
    width: 80,
    textAlign: "right",
    backgroundColor: "#ffffff",
  },
  timeoutUnit: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 6,
  },
  timeoutHint: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "right",
  },
  roomNameInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2937",
    backgroundColor: "#ffffff",
  },
});
