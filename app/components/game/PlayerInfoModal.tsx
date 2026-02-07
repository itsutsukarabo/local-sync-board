/**
 * プレイヤー情報モーダル
 * カードタップで表示。変数一覧と、ホスト向けの操作ボタンを表示する。
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { PlayerState, Variable } from "../../types";

interface PlayerInfoModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  displayName: string;
  playerState: PlayerState;
  variables: Variable[];
  isFakePlayer: boolean;
  isHost: boolean;
  onForceLeave?: () => void;
}

export default function PlayerInfoModal({
  visible,
  onClose,
  playerId,
  displayName,
  playerState,
  variables,
  isFakePlayer,
  isHost,
  onForceLeave,
}: PlayerInfoModalProps) {
  if (!visible) return null;

  const handleForceLeave = () => {
    Alert.alert("確認", `${displayName} を離席させますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "離席させる",
        style: "destructive",
        onPress: () => {
          onForceLeave?.();
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* ヘッダー */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{displayName}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {/* 架空ユーザーバッジ */}
            {isFakePlayer && (
              <View style={styles.fakeBadge}>
                <Text style={styles.fakeBadgeText}>ゲスト</Text>
              </View>
            )}

            {/* 変数一覧 */}
            {variables.map((variable) => {
              const value = playerState[variable.key];
              if (typeof value !== "number") return null;

              return (
                <View key={variable.key} style={styles.variableRow}>
                  <Text style={styles.variableLabel}>{variable.label}</Text>
                  <Text style={styles.variableValue}>
                    {value.toLocaleString()}
                  </Text>
                </View>
              );
            })}

            {/* ホスト操作ボタン */}
            {isHost && onForceLeave && (
              <View style={styles.actionSection}>
                <TouchableOpacity
                  style={styles.forceLeaveButton}
                  onPress={handleForceLeave}
                >
                  <Text style={styles.forceLeaveButtonText}>
                    🚪 離席させる
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
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
  body: {
    padding: 16,
  },
  fakeBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  fakeBadgeText: {
    fontSize: 12,
    color: "#92400e",
    fontWeight: "600",
  },
  variableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  variableLabel: {
    fontSize: 15,
    color: "#6b7280",
  },
  variableValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    fontFamily: "monospace",
  },
  actionSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  forceLeaveButton: {
    backgroundColor: "#ef4444",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  forceLeaveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
