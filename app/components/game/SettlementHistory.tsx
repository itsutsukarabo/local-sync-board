/**
 * 精算履歴テーブルコンポーネント
 * 過去の精算結果を表形式で表示するModal
 */

import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  PanResponder,
  Animated as RNAnimated,
} from "react-native";
import { Settlement } from "../../types";

interface SettlementHistoryProps {
  settlements: Settlement[];
  visible: boolean;
  onClose: () => void;
  isHost?: boolean;
  onAddAdjustment?: () => void;
}

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

export default function SettlementHistory({
  settlements,
  visible,
  onClose,
  isHost,
  onAddAdjustment,
}: SettlementHistoryProps) {
  const translateY = useRef(new RNAnimated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) {
          onClose();
          translateY.setValue(0);
        } else {
          RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  // 全settlementからプレイヤー列を集約（出現順を維持）
  const playerColumns: PlayerColumn[] = [];
  const seenUserIds = new Set<string>();

  for (const s of settlements) {
    for (const [userId, pr] of Object.entries(s.playerResults)) {
      if (!seenUserIds.has(userId)) {
        seenUserIds.add(userId);
        playerColumns.push({ userId, displayName: pr.displayName });
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

  // 行ラベル生成
  let hanchanIndex = 0;
  const rows = settlements.map((s) => {
    if (s.type === "adjustment") {
      return { label: "(調整)", settlement: s };
    }
    hanchanIndex++;
    return { label: `半荘${hanchanIndex}`, settlement: s };
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={onClose}
        />
        <RNAnimated.View
          style={[styles.modalContent, { transform: [{ translateY }] }]}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.swipeHandle} />
          </View>
          {/* ヘッダー */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>精算履歴</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {settlements.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>精算履歴がありません</Text>
            </View>
          ) : (
            <ScrollView style={styles.tableScrollVertical}>
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                  {/* テーブルヘッダー */}
                  <View style={styles.tableRow}>
                    <View style={[styles.tableCell, styles.labelCell]}>
                      <Text style={styles.headerText}> </Text>
                    </View>
                    {playerColumns.map((col) => (
                      <View
                        key={col.userId}
                        style={[styles.tableCell, styles.headerCell]}
                      >
                        <Text style={styles.headerText} numberOfLines={1}>
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
                      <View style={[styles.tableCell, styles.labelCell]}>
                        <Text style={styles.labelText}>{row.label}</Text>
                      </View>
                      {playerColumns.map((col) => {
                        const pr =
                          row.settlement.playerResults[col.userId];
                        const value = pr?.result ?? 0;
                        return (
                          <View key={col.userId} style={styles.tableCell}>
                            <Text
                              style={[
                                styles.valueText,
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
                    <View style={[styles.tableCell, styles.labelCell]}>
                      <Text style={styles.totalLabelText}>合計</Text>
                    </View>
                    {playerColumns.map((col) => {
                      const value = totals[col.userId] || 0;
                      return (
                        <View key={col.userId} style={styles.tableCell}>
                          <Text
                            style={[
                              styles.totalValueText,
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
                  {isHost && onAddAdjustment && (
                    <View style={styles.addAdjustmentRow}>
                      <TouchableOpacity
                        style={styles.addAdjustmentButton}
                        onPress={onAddAdjustment}
                      >
                        <Text style={styles.addAdjustmentButtonText}>
                          + 調整を追加
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </ScrollView>
            </ScrollView>
          )}

          {/* 精算履歴が空でもホストなら調整追加ボタンを表示 */}
          {settlements.length === 0 && isHost && onAddAdjustment && (
            <View style={styles.emptyAddAdjustment}>
              <TouchableOpacity
                style={styles.addAdjustmentButton}
                onPress={onAddAdjustment}
              >
                <Text style={styles.addAdjustmentButtonText}>
                  + 調整を追加
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </RNAnimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  swipeHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: "#6b7280",
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#9ca3af",
  },
  tableScrollVertical: {
    padding: 16,
  },
  tableRow: {
    flexDirection: "row",
  },
  tableRowAlt: {
    backgroundColor: "#f9fafb",
  },
  tableCell: {
    width: 80,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  labelCell: {
    width: 72,
    alignItems: "flex-start",
    paddingLeft: 4,
  },
  headerCell: {
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
  },
  headerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  labelText: {
    fontSize: 13,
    color: "#6b7280",
  },
  valueText: {
    fontSize: 14,
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
    fontSize: 13,
    fontWeight: "bold",
    color: "#1f2937",
  },
  totalValueText: {
    fontSize: 14,
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
  emptyAddAdjustment: {
    padding: 16,
    alignItems: "center",
  },
});
