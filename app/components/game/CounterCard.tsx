import React from "react";
import { View, StyleSheet, TouchableOpacity, Text } from "react-native";
import { useCounterCard } from "../../hooks/useCounterCard";

interface CounterCardProps {
  serverValue: number;
  canEdit: boolean;
  onCommit: (expectedValue: number, newValue: number) => Promise<{ conflictValue?: number }>;
}

export default function CounterCard({ serverValue, canEdit, onCommit }: CounterCardProps) {
  const { localValue, handlePress } = useCounterCard({ serverValue, onCommit });

  return (
    <View style={styles.card}>
      {canEdit && (
        <TouchableOpacity
          style={styles.counterHalf}
          onPress={() => handlePress(-1)}
          activeOpacity={0.7}
        >
          <Text style={styles.counterMinusIcon}>−</Text>
        </TouchableOpacity>
      )}
      {canEdit && (
        <TouchableOpacity
          style={styles.counterHalf}
          onPress={() => handlePress(1)}
          activeOpacity={0.7}
        >
          <Text style={styles.counterPlusIcon}>+</Text>
        </TouchableOpacity>
      )}
      <View style={styles.counterCenterOverlay} pointerEvents="none">
        <Text style={styles.counterCenterText}>{localValue}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: 90,
    height: 39,
    flexDirection: "row",
    overflow: "hidden",
    position: "relative",
  },
  counterHalf: {
    flex: 1,
  },
  counterMinusIcon: {
    position: "absolute",
    top: 3,
    left: 5,
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
  },
  counterPlusIcon: {
    position: "absolute",
    top: 3,
    right: 5,
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
  },
  counterCenterOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  counterCenterText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
  },
});
