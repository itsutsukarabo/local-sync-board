import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Variable } from "../../types";

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (transfers: { variable: string; amount: number }[]) => void;
  variables: Variable[];
  isProcessing?: boolean;
}

export default function PaymentModal({
  visible,
  onClose,
  onConfirm,
  variables,
  isProcessing = false,
}: PaymentModalProps) {
  // 各変数の金額を管理（文字列で保持）
  const [amounts, setAmounts] = useState<{ [key: string]: string }>({});

  // モーダルが開くたびに全変数を空欄で初期化
  useEffect(() => {
    if (visible) {
      const initial: { [key: string]: string } = {};
      variables.forEach((v) => {
        initial[v.key] = "";
      });
      setAmounts(initial);
    }
  }, [visible, variables]);

  const handleAmountChange = (key: string, value: string) => {
    // 数字のみ許可（マイナス不可）
    const cleaned = value.replace(/[^0-9]/g, "");
    setAmounts((prev) => ({ ...prev, [key]: cleaned }));
  };

  const handleQuickAmount = (key: string, amount: number) => {
    setAmounts((prev) => ({ ...prev, [key]: amount.toString() }));
  };

  const handleConfirm = () => {
    // 0でない値を持つ変数のみtransfersに含める
    const transfers = variables
      .map((v) => ({
        variable: v.key,
        amount: parseInt(amounts[v.key] || "0", 10),
      }))
      .filter((t) => t.amount !== 0);

    if (transfers.length === 0) {
      return;
    }

    onConfirm(transfers);
  };

  // 1つ以上の変数が0でない値を持っているか
  const hasValidAmount = variables.some((v) => {
    const amount = parseInt(amounts[v.key] || "0", 10);
    return amount !== 0;
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>支払い金額を入力</Text>

          <ScrollView style={styles.variableList}>
            {variables.map((variable) => (
              <View key={variable.key} style={styles.variableRow}>
                {/* ラベルと入力欄 */}
                <View style={styles.inputRow}>
                  <Text style={styles.label}>{variable.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={amounts[variable.key]}
                    placeholder={`${variable.label}を入力`}
                    placeholderTextColor="#9ca3af"
                    onChangeText={(value) =>
                      handleAmountChange(variable.key, value)
                    }
                    keyboardType="number-pad"
                    selectTextOnFocus
                  />
                </View>

                {/* クイック選択ボタン（quickAmountsが設定されている場合のみ） */}
                {variable.quickAmounts && variable.quickAmounts.length > 0 && (
                  <View style={styles.quickButtons}>
                    {variable.quickAmounts.map((quickAmount) => (
                      <TouchableOpacity
                        key={quickAmount}
                        style={styles.quickButton}
                        onPress={() =>
                          handleQuickAmount(variable.key, quickAmount)
                        }
                      >
                        <Text style={styles.quickButtonText}>
                          {quickAmount.toLocaleString()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          {/* アクションボタン */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                (!hasValidAmount || isProcessing) && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!hasValidAmount || isProcessing}
            >
              <Text
                style={[
                  styles.confirmButtonText,
                  (!hasValidAmount || isProcessing) && styles.confirmButtonTextDisabled,
                ]}
              >
                {isProcessing ? "処理中..." : "支払う"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 16,
    textAlign: "center",
  },
  variableList: {
    maxHeight: 300,
  },
  variableRow: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 16,
    color: "#374151",
    fontWeight: "500",
    flex: 1,
  },
  input: {
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    textAlign: "right",
    width: 120,
    backgroundColor: "#f9fafb",
  },
  quickButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    justifyContent: "flex-end",
    gap: 6,
  },
  quickButton: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  quickButtonText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: "#f3f4f6",
  },
  cancelButtonText: {
    color: "#1f2937",
    textAlign: "center",
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: "#3b82f6",
  },
  confirmButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  confirmButtonText: {
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "600",
  },
  confirmButtonTextDisabled: {
    color: "#e5e7eb",
  },
});
