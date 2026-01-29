import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { PotAction } from "../../types";

interface PotActionSelectModalProps {
  visible: boolean;
  actions: PotAction[];
  onSelect: (action: PotAction) => void;
  onClose: () => void;
}

export default function PotActionSelectModal({
  visible,
  actions,
  onSelect,
  onClose,
}: PotActionSelectModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>供託に入れる操作を選択</Text>

          {actions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={styles.actionButton}
              onPress={() => onSelect(action)}
            >
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionAmount}>
                -{action.amount.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>キャンセル</Text>
          </TouchableOpacity>
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
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 16,
    textAlign: "center",
  },
  actionButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#92400e",
  },
  actionAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#b45309",
  },
  cancelButton: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  cancelButtonText: {
    color: "#1f2937",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 16,
  },
});
