/**
 * ActionButtons コンポーネント
 * ゲーム中のアクションボタンを表示
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Action } from "../../types";

interface ActionButtonsProps {
  actions: Action[];
  onActionPress: (action: Action) => void;
  disabled?: boolean;
}

export default function ActionButtons({
  actions,
  onActionPress,
  disabled = false,
}: ActionButtonsProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>アクション</Text>
      <View style={styles.buttonGrid}>
        {actions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.actionButton,
              disabled && styles.actionButtonDisabled,
            ]}
            onPress={() => onActionPress(action)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.actionButtonText,
                disabled && styles.actionButtonTextDisabled,
              ]}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 12,
  },
  buttonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 8,
    minWidth: 100,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  actionButtonDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.6,
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  actionButtonTextDisabled: {
    color: "#e5e7eb",
  },
});
