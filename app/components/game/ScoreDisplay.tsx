/**
 * ScoreDisplay コンポーネント
 * スコアや変数値を表示する汎用コンポーネント
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface ScoreDisplayProps {
  label: string;
  value: number | string;
  size?: "small" | "medium" | "large";
  color?: string;
}

export default function ScoreDisplay({
  label,
  value,
  size = "medium",
  color = "#1f2937",
}: ScoreDisplayProps) {
  const valueSize = size === "small" ? 18 : size === "large" ? 32 : 24;
  const labelSize = size === "small" ? 10 : size === "large" ? 14 : 12;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { fontSize: labelSize }]}>{label}</Text>
      <Text style={[styles.value, { fontSize: valueSize, color }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  label: {
    color: "#6b7280",
    marginBottom: 4,
    fontWeight: "500",
  },
  value: {
    fontWeight: "bold",
  },
});
