import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Variable } from "../../types";

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (transfers: { variable: string; amount: number }[]) => void;
  variables: Variable[];
}

export default function PaymentModal({
  visible,
  onClose,
  onConfirm,
  variables,
}: PaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [selectedVariable, setSelectedVariable] = useState(
    variables[0]?.key || "score"
  );

  const handleConfirm = () => {
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      return;
    }
    onConfirm([{ variable: selectedVariable, amount: numAmount }]);
    setAmount("");
  };

  const quickAmounts = [1000, 2000, 3000, 5000, 8000, 12000];

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

          {/* 変数選択（複数ある場合のみ表示） */}
          {variables.length > 1 && (
            <View style={styles.variableSelector}>
              {variables.map((v) => (
                <TouchableOpacity
                  key={v.key}
                  style={[
                    styles.variableButton,
                    selectedVariable === v.key && styles.variableButtonActive,
                  ]}
                  onPress={() => setSelectedVariable(v.key)}
                >
                  <Text
                    style={[
                      styles.variableButtonText,
                      selectedVariable === v.key &&
                        styles.variableButtonTextActive,
                    ]}
                  >
                    {v.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="金額を入力"
            placeholderTextColor="#9ca3af"
          />

          {/* クイック選択ボタン */}
          <View style={styles.quickButtons}>
            {quickAmounts.map((quickAmount) => (
              <TouchableOpacity
                key={quickAmount}
                style={styles.quickButton}
                onPress={() => setAmount(quickAmount.toString())}
              >
                <Text style={styles.quickButtonText}>
                  {quickAmount.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* アクションボタン */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmButtonText}>支払う</Text>
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
    width: "80%",
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 16,
    textAlign: "center",
  },
  variableSelector: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
    gap: 8,
  },
  variableButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  variableButtonActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  variableButtonText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  variableButtonTextActive: {
    color: "#ffffff",
  },
  input: {
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 8,
  },
  quickButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 16,
  },
  quickButton: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    margin: 4,
  },
  quickButtonText: {
    fontSize: 14,
    color: "#1f2937",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
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
  confirmButtonText: {
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "600",
  },
});
