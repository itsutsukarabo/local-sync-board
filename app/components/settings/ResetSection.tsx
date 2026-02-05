/**
 * リセットセクションコンポーネント
 * 選択した変数を全プレイヤーで初期値にリセットするUI
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Variable } from "../../types";
import { resetScores } from "../../lib/roomApi";

interface ResetSectionProps {
  roomId: string;
  variables: Variable[];
  potEnabled?: boolean;
}

export default function ResetSection({
  roomId,
  variables,
  potEnabled,
}: ResetSectionProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState(false);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleReset = () => {
    const keys = Array.from(selectedKeys);
    const labels = keys
      .map((key) => variables.find((v) => v.key === key)?.label || key)
      .join(", ");

    Alert.alert(
      "リセット確認",
      `以下の変数を全プレイヤーで初期値にリセットします。\n\n${labels}\n\nこの操作は取り消し（Undo）で元に戻せます。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "リセット実行",
          style: "destructive",
          onPress: executeReset,
        },
      ]
    );
  };

  const executeReset = async () => {
    setResetting(true);
    try {
      const { error } = await resetScores(roomId, Array.from(selectedKeys));
      if (error) {
        Alert.alert("エラー", error.message);
      } else {
        Alert.alert("完了", "リセットしました。");
        setSelectedKeys(new Set());
      }
    } finally {
      setResetting(false);
    }
  };

  if (variables.length === 0) {
    return (
      <Text style={styles.emptyText}>変数が定義されていません</Text>
    );
  }

  return (
    <View>
      {variables.map((v) => {
        const checked = selectedKeys.has(v.key);
        return (
          <TouchableOpacity
            key={v.key}
            style={styles.checkboxRow}
            onPress={() => toggleKey(v.key)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              {v.label} → {v.initial.toLocaleString()}に戻す
            </Text>
          </TouchableOpacity>
        );
      })}

      {potEnabled && selectedKeys.size > 0 && (
        <Text style={styles.potWarning}>
          選択した変数の供託金もリセットされます
        </Text>
      )}

      <TouchableOpacity
        style={[
          styles.resetBtn,
          (selectedKeys.size === 0 || resetting) && styles.resetBtnDisabled,
        ]}
        onPress={handleReset}
        disabled={selectedKeys.size === 0 || resetting}
      >
        <Text
          style={[
            styles.resetBtnText,
            (selectedKeys.size === 0 || resetting) && styles.resetBtnTextDisabled,
          ]}
        >
          {resetting ? "リセット中..." : "リセット実行"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 12,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#d1d5db",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  checkboxLabel: {
    fontSize: 15,
    color: "#374151",
    flex: 1,
  },
  potWarning: {
    fontSize: 13,
    color: "#f59e0b",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  resetBtn: {
    backgroundColor: "#ef4444",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  resetBtnDisabled: {
    backgroundColor: "#e5e7eb",
  },
  resetBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  resetBtnTextDisabled: {
    color: "#9ca3af",
  },
});
