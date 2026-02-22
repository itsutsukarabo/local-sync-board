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
import { getSteps } from "../../utils/paymentUtils";

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (transfers: { variable: string; amount: number }[]) => void;
  variables: Variable[];
  fromName: string;
  toName: string;
  isProcessing?: boolean;
}


export default function PaymentModal({
  visible,
  onClose,
  onConfirm,
  variables,
  fromName,
  toName,
  isProcessing = false,
}: PaymentModalProps) {
  const [amounts, setAmounts] = useState<{ [key: string]: string }>({});

  // モーダルが開いた瞬間だけ全変数を空欄で初期化
  // variables を依存に含めると、リアルタイム更新で参照が変わるたびにリセットされるため除外
  const prevVisibleRef = React.useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      const initial: { [key: string]: string } = {};
      variables.forEach((v) => {
        initial[v.key] = "";
      });
      setAmounts(initial);
    }
    prevVisibleRef.current = visible;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAmountChange = (key: string, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    setAmounts((prev) => ({ ...prev, [key]: cleaned }));
  };

  const handleStep = (key: string, delta: number) => {
    const current = parseInt(amounts[key] || "0", 10);
    const next = Math.max(0, current + delta);
    setAmounts((prev) => ({ ...prev, [key]: next.toString() }));
  };

  const handleConfirm = () => {
    const transfers = variables
      .map((v) => ({
        variable: v.key,
        amount: parseInt(amounts[v.key] || "0", 10),
      }))
      .filter((t) => t.amount !== 0);

    if (transfers.length === 0) return;
    onConfirm(transfers);
  };

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
          <Text style={styles.title}>{fromName} → {toName}</Text>

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

                {/* スプリットボタン（横一列） */}
                <View style={styles.splitRow}>
                  {getSteps(variable).map((step) => (
                    <View key={step} style={styles.splitButton}>
                      {/* 左半分: 青 / 減算 */}
                      <TouchableOpacity
                        style={[styles.splitHalf, styles.splitHalfLeft]}
                        onPress={() => handleStep(variable.key, -step)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.splitMinusIcon}>−</Text>
                      </TouchableOpacity>

                      {/* 右半分: 赤 / 加算 */}
                      <TouchableOpacity
                        style={[styles.splitHalf, styles.splitHalfRight]}
                        onPress={() => handleStep(variable.key, step)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.splitPlusIcon}>+</Text>
                      </TouchableOpacity>

                      {/* 中央数値ラベル（タッチ透過） */}
                      <View style={styles.splitCenterOverlay} pointerEvents="none">
                        <Text style={styles.splitCenterText}>
                          {step.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
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
  // スプリットボタン行
  splitRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  splitButton: {
    flex: 1,
    flexDirection: "row",
    height: 52,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d1d5db",
    position: "relative",
  },
  splitHalf: {
    flex: 1,
  },
  splitHalfLeft: {
    backgroundColor: "#dbeafe",
  },
  splitHalfRight: {
    backgroundColor: "#fee2e2",
  },
  splitMinusIcon: {
    position: "absolute",
    top: 4,
    left: 5,
    fontSize: 13,
    fontWeight: "700",
    color: "#1e40af",
  },
  splitPlusIcon: {
    position: "absolute",
    top: 4,
    right: 5,
    fontSize: 13,
    fontWeight: "700",
    color: "#991b1b",
  },
  splitCenterOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  splitCenterText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2937",
  },
  // アクションボタン
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
