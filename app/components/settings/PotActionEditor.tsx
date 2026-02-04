/**
 * 供託操作エディタ
 * Pot操作の追加・編集・削除を行う
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
import { PotAction, Variable } from "../../types";

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
  const [newVariable, setNewVariable] = useState(
    variables[0]?.key || "score"
  );
  const [newAmount, setNewAmount] = useState("");

  const handleLabelChange = (index: number, label: string) => {
    const updated = [...potActions];
    updated[index] = { ...updated[index], label };
    onUpdate(updated);
  };

  const handleVariableChange = (index: number, variable: string) => {
    const updated = [...potActions];
    updated[index] = { ...updated[index], variable };
    onUpdate(updated);
  };

  const handleAmountChange = (index: number, text: string) => {
    const num = Number(text);
    if (text === "" || isNaN(num) || num <= 0) return;
    const updated = [...potActions];
    updated[index] = { ...updated[index], amount: num };
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
    const amount = Number(newAmount) || 0;

    if (!label) {
      Alert.alert("エラー", "表示名を入力してください。");
      return;
    }

    if (amount <= 0) {
      Alert.alert("エラー", "量は1以上を入力してください。");
      return;
    }

    if (!variables.some((v) => v.key === newVariable)) {
      Alert.alert("エラー", "無効な変数が選択されています。");
      return;
    }

    onUpdate([
      ...potActions,
      { id: generateId(), label, variable: newVariable, amount },
    ]);
    setNewLabel("");
    setNewAmount("");
    setNewVariable(variables[0]?.key || "score");
    setShowAddForm(false);
  };

  const getVariableLabel = (key: string): string => {
    const v = variables.find((v) => v.key === key);
    return v ? v.label : key;
  };

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
            <View style={styles.inputGroupNarrow}>
              <Text style={styles.inputLabel}>量</Text>
              <TextInput
                style={styles.textInput}
                value={String(action.amount)}
                onChangeText={(text) => handleAmountChange(index, text)}
                keyboardType="numeric"
                placeholder="1000"
              />
            </View>
          </View>
          <View style={styles.variableRow}>
            <Text style={styles.inputLabel}>対象変数</Text>
            <View style={styles.variableSelector}>
              {variables.map((v) => (
                <TouchableOpacity
                  key={v.key}
                  style={[
                    styles.variableChip,
                    action.variable === v.key && styles.variableChipActive,
                  ]}
                  onPress={() => handleVariableChange(index, v.key)}
                >
                  <Text
                    style={[
                      styles.variableChipText,
                      action.variable === v.key &&
                        styles.variableChipTextActive,
                    ]}
                  >
                    {v.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
            <View style={styles.inputGroupNarrow}>
              <Text style={styles.inputLabel}>量</Text>
              <TextInput
                style={styles.textInput}
                value={newAmount}
                onChangeText={setNewAmount}
                keyboardType="numeric"
                placeholder="1000"
              />
            </View>
          </View>
          <View style={styles.variableRow}>
            <Text style={styles.inputLabel}>対象変数</Text>
            <View style={styles.variableSelector}>
              {variables.map((v) => (
                <TouchableOpacity
                  key={v.key}
                  style={[
                    styles.variableChip,
                    newVariable === v.key && styles.variableChipActive,
                  ]}
                  onPress={() => setNewVariable(v.key)}
                >
                  <Text
                    style={[
                      styles.variableChipText,
                      newVariable === v.key && styles.variableChipTextActive,
                    ]}
                  >
                    {v.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.addFormActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowAddForm(false);
                setNewLabel("");
                setNewAmount("");
                setNewVariable(variables[0]?.key || "score");
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
    flex: 2,
  },
  inputGroupNarrow: {
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
  variableRow: {
    marginTop: 8,
  },
  variableSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  variableChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    fontSize: 13,
    color: "#6b7280",
  },
  variableChipTextActive: {
    color: "#3b82f6",
    fontWeight: "600",
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
