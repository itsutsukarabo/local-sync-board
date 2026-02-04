/**
 * 変数設定エディタ
 * 変数の追加・表示名編集・初期値変更・削除を行う
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
import { Variable, PotAction } from "../../types";

interface VariableEditorProps {
  variables: Variable[];
  potActions?: PotAction[];
  onUpdate: (variables: Variable[]) => void;
}

export default function VariableEditor({
  variables,
  potActions = [],
  onUpdate,
}: VariableEditorProps) {
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newInitial, setNewInitial] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const handleLabelChange = (index: number, label: string) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], label };
    onUpdate(updated);
  };

  const handleInitialChange = (index: number, text: string) => {
    const num = Number(text);
    if (text === "" || text === "-" || isNaN(num)) return;
    const updated = [...variables];
    updated[index] = { ...updated[index], initial: num };
    onUpdate(updated);
  };

  const handleDelete = (index: number) => {
    const variable = variables[index];

    // potActionsで使用中かチェック
    const usedByActions = potActions.filter(
      (a) => a.transfers.some((t) => t.variable === variable.key)
    );
    if (usedByActions.length > 0) {
      const actionNames = usedByActions.map((a) => a.label).join(", ");
      Alert.alert(
        "削除できません",
        `この変数は供託操作「${actionNames}」で使用されています。先に供託操作を削除してください。`
      );
      return;
    }

    if (variables.length <= 1) {
      Alert.alert("削除できません", "変数は最低1つ必要です。");
      return;
    }

    Alert.alert("変数を削除", `「${variable.label}」を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          const updated = variables.filter((_, i) => i !== index);
          onUpdate(updated);
        },
      },
    ]);
  };

  const handleAdd = () => {
    const key = newKey.trim();
    const label = newLabel.trim();
    const initial = Number(newInitial) || 0;

    if (!key) {
      Alert.alert("エラー", "キーを入力してください。");
      return;
    }

    if (!label) {
      Alert.alert("エラー", "表示名を入力してください。");
      return;
    }

    // キーの重複チェック
    if (variables.some((v) => v.key === key)) {
      Alert.alert("エラー", "同じキーの変数が既に存在します。");
      return;
    }

    // 予約キーのチェック
    if (key.startsWith("__")) {
      Alert.alert("エラー", "「__」で始まるキーは使用できません。");
      return;
    }

    onUpdate([...variables, { key, label, initial }]);
    setNewKey("");
    setNewLabel("");
    setNewInitial("");
    setShowAddForm(false);
  };

  return (
    <View>
      {variables.map((variable, index) => (
        <View key={variable.key} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.keyLabel}>key: {variable.key}</Text>
            <TouchableOpacity
              onPress={() => handleDelete(index)}
              style={styles.deleteBtn}
            >
              <Text style={styles.deleteBtnText}>削除</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>表示名</Text>
              <TextInput
                style={styles.textInput}
                value={variable.label}
                onChangeText={(text) => handleLabelChange(index, text)}
                placeholder="表示名"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>初期値</Text>
              <TextInput
                style={styles.textInput}
                value={String(variable.initial)}
                onChangeText={(text) => handleInitialChange(index, text)}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>
        </View>
      ))}

      {showAddForm ? (
        <View style={styles.addForm}>
          <Text style={styles.addFormTitle}>新しい変数</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>キー</Text>
              <TextInput
                style={styles.textInput}
                value={newKey}
                onChangeText={setNewKey}
                placeholder="例: bonus"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>表示名</Text>
              <TextInput
                style={styles.textInput}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="例: ボーナス"
              />
            </View>
          </View>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>初期値</Text>
              <TextInput
                style={styles.textInput}
                value={newInitial}
                onChangeText={setNewInitial}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
            <View style={styles.inputGroup} />
          </View>
          <View style={styles.addFormActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowAddForm(false);
                setNewKey("");
                setNewLabel("");
                setNewInitial("");
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
          <Text style={styles.addBtnText}>+ 変数を追加</Text>
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
  keyLabel: {
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
  inputGroup: {
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
