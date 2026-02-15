/**
 * ゲーム結果ページ（全画面表示・SNS共有用）
 * ゲーム画面から右スワイプで遷移
 */

import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  BackHandler,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRoomRealtime } from "../../../hooks/useRoomRealtime";
import { useAuth } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { saveAdjustment, fetchSettlements } from "../../../lib/roomApi";
import { Settlement } from "../../../types";
import AdjustmentModal from "../../../components/game/AdjustmentModal";
import Toast from "../../../components/common/Toast";

/** プレイヤー列情報 */
interface PlayerColumn {
  userId: string;
  displayName: string;
}

/** result値のフォーマット（+/-付き、小数点第一位） */
function formatResult(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

export default function SettlementScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { room } = useRoomRealtime(id);
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();
  const { height: screenHeight } = useWindowDimensions();

  const [adjustmentModalVisible, setAdjustmentModalVisible] = useState(false);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlementsLoading, setSettlementsLoading] = useState(true);

  const isHost = user?.id === room?.host_user_id;

  // room_settlements テーブルから精算データを取得
  const loadSettlements = useCallback(async () => {
    if (!id) return;
    setSettlementsLoading(true);
    try {
      const { settlements: data } = await fetchSettlements(id);
      setSettlements(data);
    } finally {
      setSettlementsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSettlements();
  }, [loadSettlements]);

  // 戻る操作
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      router.back();
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  // 調整行追加ハンドラー
  const handleAddAdjustment = async (settlement: Settlement) => {
    if (!room) return;

    try {
      const { error } = await saveAdjustment(room.id, settlement);

      if (error) {
        showToast("error", error.message);
        return;
      }

      setAdjustmentModalVisible(false);
      await loadSettlements();
    } catch (error) {
      console.error("Error saving adjustment:", error);
      showToast("error", "調整の保存に失敗しました");
    }
  };

  // userIdから最新の表示名を取得するヘルパー
  const getLatestDisplayName = (userId: string, fallback: string): string => {
    const seatInfo = (room?.seats || []).find(
      (s: any) => s && s.userId === userId
    );
    if (seatInfo?.displayName) return seatInfo.displayName;
    const stateDisplayName = room?.current_state?.[userId]?.__displayName__ as string | undefined;
    if (stateDisplayName) return stateDisplayName;
    return fallback;
  };

  // プレイヤー一覧（AdjustmentModal用）
  const adjustmentPlayers =
    settlements.length > 0
      ? (() => {
          const players: { userId: string; displayName: string }[] = [];
          const seenUserIds = new Set<string>();
          for (const s of settlements) {
            for (const [userId, pr] of Object.entries(s.playerResults)) {
              if (!seenUserIds.has(userId)) {
                seenUserIds.add(userId);
                players.push({ userId, displayName: getLatestDisplayName(userId, pr.displayName) });
              }
            }
          }
          return players;
        })()
      : (room?.seats || [])
          .filter(
            (s): s is NonNullable<typeof s> => s !== null && s.userId !== null
          )
          .map((s) => ({
            userId: s.userId!,
            displayName: s.displayName || s.userId!.substring(0, 8),
          }));

  // 全settlementからプレイヤー列を集約（出現順を維持、最新名を使用）
  const playerColumns: PlayerColumn[] = [];
  const seenUserIds = new Set<string>();
  for (const s of settlements) {
    for (const [userId, pr] of Object.entries(s.playerResults)) {
      if (!seenUserIds.has(userId)) {
        seenUserIds.add(userId);
        playerColumns.push({
          userId,
          displayName: getLatestDisplayName(userId, pr.displayName),
        });
      }
    }
  }

  // 各プレイヤーの合計を計算
  const totals: { [userId: string]: number } = {};
  for (const col of playerColumns) {
    totals[col.userId] = 0;
  }
  for (const s of settlements) {
    for (const [userId, pr] of Object.entries(s.playerResults)) {
      totals[userId] = (totals[userId] || 0) + pr.result;
    }
  }

  // 行ラベル生成（番号のみ、調整行はラベルなし）
  let hanchanIndex = 0;
  const rows = settlements.map((s) => {
    if (s.type === "adjustment") {
      return { label: "", settlement: s };
    }
    hanchanIndex++;
    return { label: `${hanchanIndex}`, settlement: s };
  });

  // 行数に応じてサイズを動的に調整
  // ページヘッダー(~56) + tableContainer padding(32) + border等余白(16) を固定領域として引く
  const totalRows = rows.length + 2; // +2 for header row and total row
  const availableHeight = screenHeight - 104;
  // 1行あたりの高さ = padding*2 + fontSize + border(1)
  // 最大44px、最小20pxの範囲で収める
  const rowHeight = Math.min(44, Math.max(20, availableHeight / totalRows));
  // rowHeightから逆算してpadding/fontSizeを決定（連続的にスケール）
  // rowHeight 44 → padding 12, fontSize 16 / rowHeight 20 → padding 2, fontSize 11
  const t = Math.max(0, Math.min(1, (rowHeight - 20) / 24)); // 0〜1に正規化

  const dynamicStyles = useMemo(() => ({
    cellPaddingVertical: Math.round(2 + t * 10),
    headerFontSize: Math.round(11 + t * 4),
    labelFontSize: Math.round(11 + t * 4),
    valueFontSize: Math.round(11 + t * 5),
    totalFontSize: Math.round(12 + t * 5),
  }), [t]);

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ゲーム結果</Text>
        <View style={styles.headerRight} />
      </View>

      {settlementsLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : settlements.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>精算履歴がありません</Text>
        </View>
      ) : (
        <ScrollView style={styles.tableContainer}>
          {/* テーブルヘッダー */}
          <View style={styles.tableRow}>
            <View style={[styles.labelCell, { paddingVertical: dynamicStyles.cellPaddingVertical }]}>
              <Text style={[styles.headerText, { fontSize: dynamicStyles.headerFontSize }]}> </Text>
            </View>
            {playerColumns.map((col) => (
              <View key={col.userId} style={[styles.playerCell, { paddingVertical: dynamicStyles.cellPaddingVertical }]}>
                <Text
                  style={[styles.headerText, { fontSize: dynamicStyles.headerFontSize }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {col.displayName}
                </Text>
              </View>
            ))}
          </View>

          {/* データ行 */}
          {rows.map((row, index) => (
            <View
              key={row.settlement.id}
              style={[
                styles.tableRow,
                index % 2 === 1 && styles.tableRowAlt,
              ]}
            >
              <View style={[styles.labelCell, { paddingVertical: dynamicStyles.cellPaddingVertical }]}>
                <Text style={[styles.labelText, { fontSize: dynamicStyles.labelFontSize }]}>{row.label}</Text>
              </View>
              {playerColumns.map((col) => {
                const pr = row.settlement.playerResults[col.userId];
                const value = pr?.result ?? 0;
                return (
                  <View key={col.userId} style={[styles.playerCell, { paddingVertical: dynamicStyles.cellPaddingVertical }]}>
                    <Text
                      style={[
                        styles.valueText,
                        { fontSize: dynamicStyles.valueFontSize },
                        value > 0 && styles.valuePositive,
                        value < 0 && styles.valueNegative,
                      ]}
                    >
                      {pr ? formatResult(value) : "-"}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}

          {/* 合計行 */}
          <View style={[styles.tableRow, styles.totalRow]}>
            <View style={[styles.labelCell, { paddingVertical: dynamicStyles.cellPaddingVertical }]}>
              <Text style={[styles.totalLabelText, { fontSize: dynamicStyles.labelFontSize }]}>合計</Text>
            </View>
            {playerColumns.map((col) => {
              const value = totals[col.userId] || 0;
              return (
                <View key={col.userId} style={[styles.playerCell, { paddingVertical: dynamicStyles.cellPaddingVertical }]}>
                  <Text
                    style={[
                      styles.totalValueText,
                      { fontSize: dynamicStyles.totalFontSize },
                      value > 0 && styles.valuePositive,
                      value < 0 && styles.valueNegative,
                    ]}
                  >
                    {formatResult(value)}
                  </Text>
                </View>
              );
            })}
          </View>
          {/* ホスト用：調整を追加ボタン */}
          {isHost && (
            <View style={styles.addAdjustmentRow}>
              <TouchableOpacity
                style={styles.addAdjustmentButton}
                onPress={() => setAdjustmentModalVisible(true)}
              >
                <Text style={styles.addAdjustmentButtonText}>
                  + 調整を追加
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* 調整行入力Modal */}
      <AdjustmentModal
        visible={adjustmentModalVisible}
        onClose={() => setAdjustmentModalVisible(false)}
        onConfirm={handleAddAdjustment}
        players={adjustmentPlayers}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
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
  backButton: {
    fontSize: 16,
    color: "#3b82f6",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  headerRight: {
    width: 60,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#9ca3af",
  },
  tableContainer: {
    flex: 1,
    padding: 16,
  },
  tableRow: {
    flexDirection: "row",
  },
  tableRowAlt: {
    backgroundColor: "#f9fafb",
  },
  labelCell: {
    flex: 0.8,
    paddingHorizontal: 4,
    justifyContent: "center",
    paddingLeft: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  playerCell: {
    flex: 1,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerText: {
    fontWeight: "600",
    color: "#374151",
  },
  labelText: {
    color: "#6b7280",
  },
  valueText: {
    fontFamily: "monospace",
    color: "#1f2937",
  },
  valuePositive: {
    color: "#2563eb",
  },
  valueNegative: {
    color: "#dc2626",
  },
  totalRow: {
    borderTopWidth: 2,
    borderTopColor: "#374151",
  },
  totalLabelText: {
    fontWeight: "bold",
    color: "#1f2937",
  },
  totalValueText: {
    fontWeight: "bold",
    fontFamily: "monospace",
    color: "#1f2937",
  },
  addAdjustmentRow: {
    paddingVertical: 12,
    alignItems: "center",
  },
  addAdjustmentButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  addAdjustmentButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
