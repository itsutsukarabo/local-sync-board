/**
 * 調整行入力モーダル
 * 各プレイヤーの調整値を入力し、合計0の場合のみ確定可能
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Settlement, SettlementPlayerResult } from "../../types";

interface PlayerInfo {
  userId: string;
  displayName: string;
}

interface AdjustmentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (settlement: Settlement) => void;
  players: PlayerInfo[];
}

/** UUID生成（簡易版） */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 入力値のバリデーション（小数点第一位まで許可） */
function isValidInput(text: string): boolean {
  return /^-?[0-9]*\.?[0-9]?$/.test(text);
}

export default function AdjustmentModal({
  visible,
  onClose,
  onConfirm,
  players,
}: AdjustmentModalProps) {
  const [values, setValues] = useState<{ [userId: string]: string }>({});

  const handleChangeValue = useCallback((userId: string, text: string) => {
    if (text === "" || text === "-" || text === "-." || isValidInput(text)) {
      setValues((prev) => ({ ...prev, [userId]: text }));
    }
  }, []);

  // 合計計算
  const total = players.reduce((sum, p) => {
    const v = parseFloat(values[p.userId] || "0");
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  // 浮動小数点誤差を考慮した合計0チェック
  const isZero = Math.abs(total) < 0.001;

  // 全て0かどうかチェック（全て0なら追加不可）
  const allZero = players.every((p) => {
    const v = parseFloat(values[p.userId] || "0");
    return isNaN(v) || v === 0;
  });

  const canConfirm = isZero && !allZero;

  const handleConfirm = () => {
    const playerResults: { [userId: string]: SettlementPlayerResult } = {};
    for (const p of players) {
      const result = parseFloat(values[p.userId] || "0") || 0;
      playerResults[p.userId] = {
        displayName: p.displayName,
        finalScore: 0,
        rank: 0,
        rankBonus: 0,
        adjustedScore: 0,
        divided: 0,
        result,
      };
    }

    const settlement: Settlement = {
      id: generateUUID(),
      timestamp: Date.now(),
      type: "adjustment",
      playerResults,
    };

    onConfirm(settlement);
    setValues({});
  };

  const handleClose = () => {
    setValues({});
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalContent}>
          {/* ヘッダー */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>調整を追加</Text>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {/* プレイヤー入力行 */}
            {players.map((p) => (
              <View key={p.userId} style={styles.playerRow}>
                <Text style={styles.playerName} numberOfLines={1}>
                  {p.displayName}
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  value={values[p.userId] || ""}
                  onChangeText={(text) => handleChangeValue(p.userId, text)}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            ))}

            {/* 合計表示 */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>合計:</Text>
              <Text
                style={[
                  styles.totalValue,
                  isZero ? styles.totalValid : styles.totalInvalid,
                ]}
              >
                {total.toFixed(1)} {isZero ? "✓" : "✗"}
              </Text>
            </View>
          </ScrollView>

          {/* ボタン */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                !canConfirm && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text
                style={[
                  styles.confirmButtonText,
                  !canConfirm && styles.confirmButtonTextDisabled,
                ]}
              >
                追加
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  playerName: {
    flex: 1,
    fontSize: 16,
    color: "#1f2937",
    marginRight: 12,
  },
  input: {
    width: 100,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    fontFamily: "monospace",
    textAlign: "right",
    color: "#1f2937",
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginRight: 8,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  totalValid: {
    color: "#10b981",
  },
  totalInvalid: {
    color: "#ef4444",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  confirmButton: {
    backgroundColor: "#8b5cf6",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButtonTextDisabled: {
    color: "#9ca3af",
  },
});
