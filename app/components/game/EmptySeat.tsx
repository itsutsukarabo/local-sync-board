import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SeatPosition } from "../../types";
import { getSeatStyle } from "../../utils/seatUtils";

interface EmptySeatProps {
  position: SeatPosition;
  seatIndex: number;
  onJoinSeat: (seatIndex: number) => void;
  onLongPressJoinFake?: (seatIndex: number) => void;
  isUserSeated?: boolean;
  isJoining?: boolean;
}

export default function EmptySeat({
  position,
  seatIndex,
  onJoinSeat,
  onLongPressJoinFake,
  isUserSeated = false,
  isJoining = false,
}: EmptySeatProps) {
  const positionStyle = getSeatStyle(position);
  const [showGuestHint, setShowGuestHint] = useState(false);

  // ホストが未着席の場合のみ5秒ごとに表示を切り替え
  const canCreateGuest = !!onLongPressJoinFake;
  const hostSeated = canCreateGuest && isUserSeated;

  useEffect(() => {
    // ホスト着席時はタイマー不要（固定表示）
    if (!canCreateGuest || hostSeated) return;
    const interval = setInterval(() => {
      setShowGuestHint((prev) => !prev);
    }, 5000);
    return () => clearInterval(interval);
  }, [canCreateGuest, hostSeated]);

  // ラベルとアクションの決定
  let label: string;
  let handlePress: () => void;
  let handleLongPress: (() => void) | undefined;

  if (hostSeated) {
    // ホスト着席済み: ゲスト作成のみ（タップでも長押しでも）
    label = "タップでゲスト作成";
    handlePress = () => onLongPressJoinFake!(seatIndex);
    handleLongPress = undefined;
  } else if (isUserSeated) {
    // 非ホストが着席済み: 表示されないはずだが念のため
    label = "";
    handlePress = () => {};
    handleLongPress = undefined;
  } else {
    // 未着席: 従来の動作
    label = canCreateGuest && showGuestHint ? "長押しでゲスト作成" : "着席する";
    handlePress = () => onJoinSeat(seatIndex);
    handleLongPress = canCreateGuest ? () => onLongPressJoinFake!(seatIndex) : undefined;
  }

  if (isJoining) {
    return (
      <View style={[styles.container, positionStyle]}>
        <View style={[styles.button, styles.buttonDisabled]}>
          <ActivityIndicator size="small" color="#6b7280" />
          <Text style={styles.label}>着席中...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, positionStyle]}>
      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        onLongPress={handleLongPress}
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
  buttonDisabled: {
    opacity: 0.6,
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
