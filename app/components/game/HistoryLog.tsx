/**
 * 履歴ログコンポーネント（二層構造）
 * - プレビュー: current_state.__recent_log__ の最新エントリを表示
 * - モーダル: room_history テーブルからページネーション取得して全履歴を閲覧
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  Modal,
  PanResponder,
  Animated as RNAnimated,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { fetchHistory, RoomHistoryEntry } from "../../lib/roomApi";

const ONE_MINUTE = 60_000;

/** __recent_log__ のエントリ型（roomApi の RecentLogEntry と同一構造） */
export interface RecentLogEntry {
  id: string;
  timestamp: number;
  message: string;
}

interface HistoryLogProps {
  recentLog: RecentLogEntry[];
  roomId: string;
  onRollback: (historyId: string) => Promise<void>;
  onUndo: () => Promise<void>;
  isHost: boolean;
  settlementCount?: number;
}

export default function HistoryLog({
  recentLog,
  roomId,
  onRollback,
  onUndo,
  isHost,
  settlementCount,
}: HistoryLogProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const translateY = useRef(new RNAnimated.Value(0)).current;

  // モーダル用の履歴データ
  const [modalEntries, setModalEntries] = useState<RoomHistoryEntry[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) {
          setIsExpanded(false);
          translateY.setValue(0);
        } else {
          RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // 10秒ごとに現在時刻を更新（古いプレビューログを消すため）
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (timestamp: number | string) => {
    const date = typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp);
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // モーダルを開いたとき、初回の履歴を取得
  const openModal = useCallback(async () => {
    setIsExpanded(true);
    setModalEntries([]);
    setCursor(undefined);
    setHasMore(true);
    setModalLoading(true);
    try {
      const result = await fetchHistory(roomId);
      setModalEntries(result.entries);
      setHasMore(result.hasMore);
      if (result.entries.length > 0) {
        setCursor(result.entries[result.entries.length - 1].created_at);
      }
    } finally {
      setModalLoading(false);
    }
  }, [roomId]);

  // スクロール末端で次ページを取得
  const loadMore = useCallback(async () => {
    if (modalLoading || !hasMore || !cursor) return;
    setModalLoading(true);
    try {
      const result = await fetchHistory(roomId, cursor);
      setModalEntries((prev) => [...prev, ...result.entries]);
      setHasMore(result.hasMore);
      if (result.entries.length > 0) {
        setCursor(result.entries[result.entries.length - 1].created_at);
      }
    } finally {
      setModalLoading(false);
    }
  }, [roomId, cursor, hasMore, modalLoading]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
      if (isNearBottom && hasMore && !modalLoading) {
        loadMore();
      }
    },
    [loadMore, hasMore, modalLoading]
  );

  const handleUndo = async () => {
    if (recentLog.length === 0) {
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

  const handleRollback = (entry: RoomHistoryEntry) => {
    Alert.alert(
      "タイムトラベル",
      `${formatTime(entry.created_at)} の状態に戻しますか？\n\nこの操作以降の変更は全て取り消されます。`,
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

  // プレビュー表示用: 直近1分以内のエントリ or 最新1件
  const previewEntries = (() => {
    if (recentLog.length === 0) return [];
    const recent = recentLog.filter((e) => now - e.timestamp < ONE_MINUTE);
    return recent.length > 0 ? recent : [recentLog[recentLog.length - 1]];
  })();

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={openModal}
        >
          <Text style={styles.headerTitle}>
            📜 履歴
          </Text>
          <Text style={styles.expandIcon}>▼</Text>
        </TouchableOpacity>

        {/* 精算履歴ボタン */}
        {(settlementCount ?? 0) > 0 && roomId && (
          <TouchableOpacity
            style={styles.settlementButton}
            onPress={() => router.push(`/game/settlement/${roomId}`)}
          >
            <Text style={styles.settlementButtonText}>結果一覧→</Text>
          </TouchableOpacity>
        )}

        {/* Undoボタン */}
        {isHost && recentLog.length > 0 && (
          <TouchableOpacity
            style={[styles.undoButton, isLoading && styles.buttonDisabled]}
            onPress={handleUndo}
            disabled={isLoading}
          >
            <Text style={styles.undoButtonText}>↩ 取消</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 最新1分間の履歴をプレビュー表示 */}
      {previewEntries.map((entry) => (
        <View key={entry.id} style={styles.preview}>
          <Text style={styles.previewTime}>
            {formatTime(entry.timestamp)}
          </Text>
          <Text style={styles.previewMessage} numberOfLines={1}>
            {entry.message}
          </Text>
        </View>
      ))}

      {/* 展開時のモーダル（room_history からページネーション取得） */}
      <Modal
        visible={isExpanded}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsExpanded(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setIsExpanded(false)}
          />
          <RNAnimated.View
            style={[styles.modalContent, { transform: [{ translateY }] }]}
          >
            <View {...panResponder.panHandlers}>
              <View style={styles.swipeHandle} />
            </View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>操作履歴</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsExpanded(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {modalEntries.length === 0 && !modalLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>履歴がありません</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.historyList}
                onScroll={handleScroll}
                scrollEventThrottle={200}
              >
                {modalEntries.map((entry, index) => (
                  <View key={entry.id} style={styles.historyItem}>
                    <View style={styles.historyItemContent}>
                      <View style={styles.historyItemHeader}>
                        <Text style={styles.historyTime}>
                          {formatTime(entry.created_at)}
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

                {modalLoading && (
                  <View style={styles.loadingMore}>
                    <ActivityIndicator size="small" color="#6b7280" />
                    <Text style={styles.loadingMoreText}>読み込み中...</Text>
                  </View>
                )}

                {!hasMore && modalEntries.length > 0 && (
                  <View style={styles.endOfList}>
                    <Text style={styles.endOfListText}>-- ここまで --</Text>
                  </View>
                )}
              </ScrollView>
            )}

            {isHost && (
              <View style={styles.modalFooter}>
                <Text style={styles.footerHint}>
                  🔄 をタップするとその時点に戻せます
                </Text>
              </View>
            )}
          </RNAnimated.View>
        </View>
      </Modal>
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
    fontSize: 13,
    fontWeight: "600",
    color: "#7c3aed",
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
  loadingMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 13,
    color: "#6b7280",
  },
  endOfList: {
    alignItems: "center",
    paddingVertical: 16,
  },
  endOfListText: {
    fontSize: 13,
    color: "#d1d5db",
  },
});
