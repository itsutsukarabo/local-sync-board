import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, TouchableOpacity, Text } from "react-native";

interface CounterCardProps {
  serverValue: number;
  canEdit: boolean;
  onCommit: (expectedValue: number, newValue: number) => Promise<{ conflictValue?: number }>;
}

export default function CounterCard({ serverValue, canEdit, onCommit }: CounterCardProps) {
  const [localValue, setLocalValue] = useState(serverValue);

  const serverValueRef = useRef(serverValue);
  const baseValueRef = useRef(serverValue);
  const localValueRef = useRef(serverValue);
  const isEditingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // サーバー値が更新されたとき（Realtime経由）
  useEffect(() => {
    serverValueRef.current = serverValue;
    if (!isEditingRef.current) {
      baseValueRef.current = serverValue;
      localValueRef.current = serverValue;
      setLocalValue(serverValue);
    }
  }, [serverValue]);

  const handlePress = (delta: number) => {
    if (!isEditingRef.current) {
      // 編集セッション開始: この時点のサーバー値を expected として記録
      baseValueRef.current = serverValueRef.current;
      isEditingRef.current = true;
    }
    const next = localValueRef.current + delta;
    localValueRef.current = next;
    setLocalValue(next);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      isEditingRef.current = false;
      if (localValueRef.current !== serverValueRef.current) {
        const result = await onCommit(baseValueRef.current, localValueRef.current);
        if (result.conflictValue !== undefined) {
          // 競合: DBの現在値に強制同期
          serverValueRef.current = result.conflictValue;
          baseValueRef.current = result.conflictValue;
          localValueRef.current = result.conflictValue;
          setLocalValue(result.conflictValue);
        }
      }
    }, 3000);
  };

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
