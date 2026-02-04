/**
 * 供託操作エディタ
 * Pot操作の追加・編集・削除を行う（複数変数対応）
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { PotAction, PotTransfer, Variable } from "../../types";

interface PotActionEditorProps {
  potActions: PotAction[];
  variables: Variable[];
  onUpdate: (potActions: PotAction[]) => void;
}

/**
 * 簡易UUID生成
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export default function PotActionEditor({
  potActions,
  variables,
  onUpdate,
}: PotActionEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTransfers, setNewTransfers] = useState<PotTransfer[]>([
    { variable: variables[0]?.key || "score", amount: 0 },
  ]);

  const handleLabelChange = (index: number, label: string) => {
    const updated = [...potActions];
    updated[index] = { ...updated[index], label };
    onUpdate(updated);
  };

  const handleTransferVariableChange = (
    actionIndex: number,
    transferIndex: number,
    variable: string
  ) => {
    const updated = [...potActions];
    const transfers = [...updated[actionIndex].transfers];
    transfers[transferIndex] = { ...transfers[transferIndex], variable };
    updated[actionIndex] = { ...updated[actionIndex], transfers };
    onUpdate(updated);
  };

  const handleTransferAmountChange = (
    actionIndex: number,
    transferIndex: number,
    text: string
  ) => {
    const num = Number(text);
    if (text === "" || isNaN(num) || num <= 0) return;
    const updated = [...potActions];
    const transfers = [...updated[actionIndex].transfers];
    transfers[transferIndex] = { ...transfers[transferIndex], amount: num };
    updated[actionIndex] = { ...updated[actionIndex], transfers };
    onUpdate(updated);
  };

  const handleAddTransfer = (actionIndex: number) => {
    const updated = [...potActions];
    const transfers = [
      ...updated[actionIndex].transfers,
      { variable: variables[0]?.key || "score", amount: 0 },
    ];
    updated[actionIndex] = { ...updated[actionIndex], transfers };
    onUpdate(updated);
  };

  const handleDeleteTransfer = (actionIndex: number, transferIndex: number) => {
    const updated = [...potActions];
    if (updated[actionIndex].transfers.length <= 1) {
      Alert.alert("エラー", "最低1つの変数が必要です。");
      return;
    }
    const transfers = updated[actionIndex].transfers.filter(
      (_, i) => i !== transferIndex
    );
    updated[actionIndex] = { ...updated[actionIndex], transfers };
    onUpdate(updated);
  };

  const handleDelete = (index: number) => {
    const action = potActions[index];
    Alert.alert("操作を削除", `「${action.label}」を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          const updated = potActions.filter((_, i) => i !== index);
          onUpdate(updated);
        },
      },
    ]);
  };

  const handleAdd = () => {
    const label = newLabel.trim();

    if (!label) {
      Alert.alert("エラー", "表示名を入力してください。");
      return;
    }

    const validTransfers = newTransfers.filter((t) => t.amount > 0);
    if (validTransfers.length === 0) {
      Alert.alert("エラー", "量は1以上を入力してください。");
      return;
    }

    for (const t of validTransfers) {
      if (!variables.some((v) => v.key === t.variable)) {
        Alert.alert("エラー", "無効な変数が選択されています。");
        return;
      }
    }

    onUpdate([
      ...potActions,
      { id: generateId(), label, transfers: validTransfers },
    ]);
    setNewLabel("");
    setNewTransfers([{ variable: variables[0]?.key || "score", amount: 0 }]);
    setShowAddForm(false);
  };

  const handleNewTransferVariableChange = (index: number, variable: string) => {
    const updated = [...newTransfers];
    updated[index] = { ...updated[index], variable };
    setNewTransfers(updated);
  };

  const handleNewTransferAmountChange = (index: number, text: string) => {
    const num = Number(text);
    if (text !== "" && (isNaN(num) || num < 0)) return;
    const updated = [...newTransfers];
    updated[index] = { ...updated[index], amount: num || 0 };
    setNewTransfers(updated);
  };

  const handleAddNewTransfer = () => {
    setNewTransfers([
      ...newTransfers,
      { variable: variables[0]?.key || "score", amount: 0 },
    ]);
  };

  const handleDeleteNewTransfer = (index: number) => {
    if (newTransfers.length <= 1) return;
    setNewTransfers(newTransfers.filter((_, i) => i !== index));
  };

  const renderTransferRow = (
    transfer: PotTransfer,
    transferIndex: number,
    onVariableChange: (index: number, variable: string) => void,
    onAmountChange: (index: number, text: string) => void,
    onDeleteTransfer?: (index: number) => void,
    canDelete?: boolean
  ) => (
    <View key={transferIndex} style={styles.transferRow}>
      <View style={styles.transferContent}>
        <View style={styles.variableSelector}>
          {variables.map((v) => (
            <TouchableOpacity
              key={v.key}
              style={[
                styles.variableChip,
                transfer.variable === v.key && styles.variableChipActive,
              ]}
              onPress={() => onVariableChange(transferIndex, v.key)}
            >
              <Text
                style={[
                  styles.variableChipText,
                  transfer.variable === v.key && styles.variableChipTextActive,
                ]}
              >
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.amountRow}>
          <TextInput
            style={styles.amountInput}
            value={transfer.amount > 0 ? String(transfer.amount) : ""}
            onChangeText={(text) => onAmountChange(transferIndex, text)}
            keyboardType="numeric"
            placeholder="1000"
          />
          {onDeleteTransfer && canDelete && (
            <TouchableOpacity
              onPress={() => onDeleteTransfer(transferIndex)}
              style={styles.transferDeleteBtn}
            >
              <Text style={styles.transferDeleteBtnText}>x</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View>
      {potActions.map((action, index) => (
        <View key={action.id} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.idLabel}>id: {action.id}</Text>
            <TouchableOpacity
              onPress={() => handleDelete(index)}
              style={styles.deleteBtn}
            >
              <Text style={styles.deleteBtnText}>削除</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputRow}>
            <View style={styles.inputGroupWide}>
              <Text style={styles.inputLabel}>表示名</Text>
              <TextInput
                style={styles.textInput}
                value={action.label}
                onChangeText={(text) => handleLabelChange(index, text)}
                placeholder="表示名"
              />
            </View>
          </View>
          <View style={styles.transfersSection}>
            <Text style={styles.inputLabel}>変数と量</Text>
            {action.transfers.map((transfer, tIndex) =>
              renderTransferRow(
                transfer,
                tIndex,
                (ti, v) => handleTransferVariableChange(index, ti, v),
                (ti, t) => handleTransferAmountChange(index, ti, t),
                (ti) => handleDeleteTransfer(index, ti),
                action.transfers.length > 1
              )
            )}
            <TouchableOpacity
              style={styles.addTransferBtn}
              onPress={() => handleAddTransfer(index)}
            >
              <Text style={styles.addTransferBtnText}>+ 変数を追加</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {showAddForm ? (
        <View style={styles.addForm}>
          <Text style={styles.addFormTitle}>新しい操作</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputGroupWide}>
              <Text style={styles.inputLabel}>表示名</Text>
              <TextInput
                style={styles.textInput}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="例: リーチ"
              />
            </View>
          </View>
          <View style={styles.transfersSection}>
            <Text style={styles.inputLabel}>変数と量</Text>
            {newTransfers.map((transfer, tIndex) =>
              renderTransferRow(
                transfer,
                tIndex,
                handleNewTransferVariableChange,
                handleNewTransferAmountChange,
                handleDeleteNewTransfer,
                newTransfers.length > 1
              )
            )}
            <TouchableOpacity
              style={styles.addTransferBtn}
              onPress={handleAddNewTransfer}
            >
              <Text style={styles.addTransferBtnText}>+ 変数を追加</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.addFormActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowAddForm(false);
                setNewLabel("");
                setNewTransfers([
                  { variable: variables[0]?.key || "score", amount: 0 },
                ]);
              }}
            >
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleAdd}>
              <Text style={styles.confirmBtnText}>追加</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddForm(true)}
        >
          <Text style={styles.addBtnText}>+ 操作を追加</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 12,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  idLabel: {
    fontSize: 12,
    color: "#9ca3af",
    fontFamily: "monospace",
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#fef2f2",
  },
  deleteBtnText: {
    fontSize: 12,
    color: "#ef4444",
    fontWeight: "500",
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputGroupWide: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#1f2937",
    backgroundColor: "#f9fafb",
  },
  transfersSection: {
    marginTop: 8,
  },
  transferRow: {
    marginBottom: 6,
  },
  transferContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  variableSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    flex: 1,
  },
  variableChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
  },
  variableChipActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  variableChipText: {
    fontSize: 12,
    color: "#6b7280",
  },
  variableChipTextActive: {
    color: "#3b82f6",
    fontWeight: "600",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: "#1f2937",
    backgroundColor: "#f9fafb",
    width: 80,
    textAlign: "right",
  },
  transferDeleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  transferDeleteBtnText: {
    fontSize: 12,
    color: "#ef4444",
    fontWeight: "bold",
  },
  addTransferBtn: {
    marginTop: 4,
    paddingVertical: 6,
    alignItems: "center",
  },
  addTransferBtnText: {
    fontSize: 12,
    color: "#6b7280",
  },
  addForm: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  addFormTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: 10,
  },
  addFormActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
  },
  cancelBtnText: {
    fontSize: 14,
    color: "#374151",
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#3b82f6",
  },
  confirmBtnText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "600",
  },
  addBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3b82f6",
    borderStyle: "dashed",
    alignItems: "center",
  },
  addBtnText: {
    fontSize: 14,
    color: "#3b82f6",
    fontWeight: "500",
  },
});
