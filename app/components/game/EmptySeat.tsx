import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SeatPosition } from "../../types";
import { getSeatStyle } from "../../utils/seatUtils";

interface EmptySeatProps {
  position: SeatPosition;
  seatIndex: number;
  onJoinSeat: (seatIndex: number) => void;
  onLongPressJoinFake?: (seatIndex: number) => void;
}

export default function EmptySeat({
  position,
  seatIndex,
  onJoinSeat,
  onLongPressJoinFake,
}: EmptySeatProps) {
  const positionStyle = getSeatStyle(position);
  const [showGuestHint, setShowGuestHint] = useState(false);

  // ホストの場合のみ5秒ごとに表示を切り替え
  useEffect(() => {
    if (!onLongPressJoinFake) return;
    const interval = setInterval(() => {
      setShowGuestHint((prev) => !prev);
    }, 5000);
    return () => clearInterval(interval);
  }, [onLongPressJoinFake]);

  const label = onLongPressJoinFake && showGuestHint
    ? "長押しでゲスト作成"
    : "着席する";

  return (
    <View style={[styles.container, positionStyle]}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onJoinSeat(seatIndex)}
        onLongPress={onLongPressJoinFake ? () => onLongPressJoinFake(seatIndex) : undefined}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>+</Text>
        </View>
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "#d1d5db",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
    minHeight: 100,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  icon: {
    fontSize: 24,
    color: "#6b7280",
    fontWeight: "bold",
  },
  label: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
});
