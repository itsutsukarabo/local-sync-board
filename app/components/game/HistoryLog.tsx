/**
 * 履歴ログコンポーネント
 * 全操作の履歴を表示し、任意の時点への復元（タイムトラベル）を可能にする
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from "react-native";
import { HistoryEntry } from "../../types";

const ONE_MINUTE = 60_000;

interface HistoryLogProps {
  history: HistoryEntry[];
  onRollback: (historyId: string) => Promise<void>;
  onUndo: () => Promise<void>;
  isHost: boolean;
  settlementCount?: number;
  onOpenSettlementHistory?: () => void;
}

export default function HistoryLog({
  history,
  onRollback,
  onUndo,
  isHost,
  settlementCount,
  onOpenSettlementHistory,
}: HistoryLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // 10秒ごとに現在時刻を更新（古いプレビューログを消すため）
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const handleUndo = async () => {
    if (history.length === 0) {
      Alert.alert("エラー", "取り消せる操作がありません");
      return;
    }

    Alert.alert("確認", "直前の操作を取り消しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "取り消す",
        style: "destructive",
        onPress: async () => {
          setIsLoading(true);
          try {
            await onUndo();
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const handleRollback = (entry: HistoryEntry) => {
    Alert.alert(
      "タイムトラベル",
      `${formatTime(entry.timestamp)} の状態に戻しますか？\n\nこの操作以降の変更は全て取り消されます。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "戻す",
          style: "destructive",
          onPress: async () => {
            setIsLoading(true);
            try {
              await onRollback(entry.id);
              setIsExpanded(false);
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  // 履歴を新しい順に表示
  const reversedHistory = [...history].reverse();

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <Text style={styles.headerTitle}>
            📜 履歴 ({history.length})
          </Text>
          <Text style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {/* 精算履歴ボタン */}
        {(settlementCount ?? 0) > 0 && onOpenSettlementHistory && (
          <TouchableOpacity
            style={styles.settlementButton}
            onPress={onOpenSettlementHistory}
          >
            <Text style={styles.settlementButtonText}>📊</Text>
          </TouchableOpacity>
        )}

        {/* Undoボタン */}
        {isHost && history.length > 0 && (
          <TouchableOpacity
            style={[styles.undoButton, isLoading && styles.buttonDisabled]}
            onPress={handleUndo}
            disabled={isLoading}
          >
            <Text style={styles.undoButtonText}>↩ 取消</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 最新1分間の履歴をプレビュー表示（折りたたみ時） */}
      {!isExpanded && history.length > 0 && (() => {
        const recentEntries = [...history]
          .filter((e) => now - e.timestamp < ONE_MINUTE)
          .reverse();
        // 1分以内のエントリがない場合は最新1件を表示
        const entries = recentEntries.length > 0
          ? recentEntries
          : [history[history.length - 1]];
        return entries.map((entry) => (
          <View key={entry.id} style={styles.preview}>
            <Text style={styles.previewTime}>
              {formatTime(entry.timestamp)}
            </Text>
            <Text style={styles.previewMessage} numberOfLines={1}>
              {entry.message}
            </Text>
          </View>
        ));
      })()}

      {/* 展開時の履歴リスト */}
      {isExpanded && (
        <Modal
          visible={isExpanded}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsExpanded(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>操作履歴</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setIsExpanded(false)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              {history.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>履歴がありません</Text>
                </View>
              ) : (
                <ScrollView style={styles.historyList}>
                  {reversedHistory.map((entry, index) => (
                    <View key={entry.id} style={styles.historyItem}>
                      <View style={styles.historyItemContent}>
                        <View style={styles.historyItemHeader}>
                          <Text style={styles.historyTime}>
                            {formatTime(entry.timestamp)}
                          </Text>
                          <Text style={styles.historyIndex}>
                            #{history.length - index}
                          </Text>
                        </View>
                        <Text style={styles.historyMessage}>
                          {entry.message}
                        </Text>
                      </View>

                      {/* ロールバックボタン（ホストのみ、最新以外） */}
                      {isHost && index > 0 && (
                        <TouchableOpacity
                          style={[
                            styles.rollbackButton,
                            isLoading && styles.buttonDisabled,
                          ]}
                          onPress={() => handleRollback(entry)}
                          disabled={isLoading}
                        >
                          <Text style={styles.rollbackButtonText}>
                            🔄
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}

              {isHost && (
                <View style={styles.modalFooter}>
                  <Text style={styles.footerHint}>
                    🔄 をタップするとその時点に戻せます
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#f3f4f6",
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  expandIcon: {
    marginLeft: 8,
    fontSize: 12,
    color: "#6b7280",
  },
  settlementButton: {
    backgroundColor: "#ede9fe",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
  },
  settlementButtonText: {
    fontSize: 16,
  },
  undoButton: {
    backgroundColor: "#f59e0b",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  undoButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  previewTime: {
    fontSize: 12,
    color: "#6b7280",
    fontFamily: "monospace",
  },
  previewMessage: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
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
  historyList: {
    padding: 16,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  historyItemContent: {
    flex: 1,
  },
  historyItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  historyTime: {
    fontSize: 12,
    color: "#6b7280",
    fontFamily: "monospace",
  },
  historyIndex: {
    fontSize: 11,
    color: "#9ca3af",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyMessage: {
    fontSize: 15,
    color: "#1f2937",
  },
  rollbackButton: {
    backgroundColor: "#eff6ff",
    padding: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  rollbackButtonText: {
    fontSize: 18,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    alignItems: "center",
  },
  footerHint: {
    fontSize: 13,
    color: "#6b7280",
  },
});
