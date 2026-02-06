import React, { useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, runOnJS } from "react-native-reanimated";
import { PlayerState, Variable, SeatPosition } from "../../types";
import { getSeatStyle } from "../../utils/seatUtils";

interface MahjongPlayerCardProps {
  playerId: string;
  playerState: PlayerState;
  variables: Variable[];
  isCurrentUser: boolean;
  isHost: boolean;
  position: SeatPosition;
  disconnectedAt?: number | null;
  onDragStart: (playerId: string, x: number, y: number) => void;
  onDragUpdate: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onPositionMeasured?: (playerId: string, x: number, y: number) => void;
}

function formatDisconnectDuration(disconnectedAt: number): string {
  const elapsed = Math.floor((Date.now() - disconnectedAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  if (minutes > 0)
    return `切断中 ${minutes}分${seconds.toString().padStart(2, "0")}秒`;
  return `切断中 ${seconds}秒`;
}

export default function MahjongPlayerCard({
  playerId,
  playerState,
  variables,
  isCurrentUser,
  isHost,
  position,
  disconnectedAt,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  onPositionMeasured,
}: MahjongPlayerCardProps) {
  const viewRef = useRef<View>(null);
  const cardCenterX = useSharedValue(0);
  const cardCenterY = useSharedValue(0);

  // カードの位置を測定して親に通知
  useEffect(() => {
    const measurePosition = () => {
      if (viewRef.current && onPositionMeasured) {
        viewRef.current.measureInWindow((x, y, width, height) => {
          const centerX = x + width / 2;
          const centerY = y + height / 2;
          onPositionMeasured(playerId, centerX, centerY);
        });
      }
    };

    // 複数回測定して確実に取得
    const timer1 = setTimeout(measurePosition, 100);
    const timer2 = setTimeout(measurePosition, 500);
    const timer3 = setTimeout(measurePosition, 1000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [playerId, position, onPositionMeasured]);

  const handleDragStart = useCallback(() => {
    // ドラッグ開始時に座標を測定（ページ全体に対する座標）
    if (viewRef.current) {
      viewRef.current.measure((x, y, width, height, pageX, pageY) => {
        const centerX = pageX + width / 2;
        const centerY = pageY + height / 2;
        cardCenterX.value = centerX;
        cardCenterY.value = centerY;
        onDragStart(playerId, centerX, centerY);
      });
    }
  }, [playerId, onDragStart, cardCenterX, cardCenterY]);

  const gesture = Gesture.Pan()
    .enabled(isCurrentUser) // 自分のカードのみドラッグ可能
    .onStart((event) => {
      "worklet";
      // ドラッグ開始時の絶対座標を使用
      runOnJS(onDragStart)(playerId, event.absoluteX, event.absoluteY);
    })
    .onUpdate((event) => {
      "worklet";
      // ドラッグ中の絶対座標を使用
      runOnJS(onDragUpdate)(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      "worklet";
      // ドラッグ終了時の絶対座標を使用
      runOnJS(onDragEnd)(event.absoluteX, event.absoluteY);
    });

  const positionStyle = getSeatStyle(position);

  return (
    <View style={[styles.container, positionStyle]} ref={viewRef}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.card}>
          <View style={styles.header}>
            {isHost && <Text style={styles.crown}>👑</Text>}
            <Text style={styles.name} numberOfLines={1}>
              {isCurrentUser ? "あなた" : `Player ${playerId.slice(0, 4)}`}
            </Text>
          </View>
          {disconnectedAt != null && (
            <Text style={styles.disconnectText}>
              {formatDisconnectDuration(disconnectedAt)}
            </Text>
          )}
          {variables.map((variable) => {
            const value = playerState[variable.key];
            if (typeof value !== "number") return null;

            return (
              <View key={variable.key} style={styles.stat}>
                <Text style={styles.label}>{variable.label}</Text>
                <Text style={styles.value}>{value.toLocaleString()}</Text>
              </View>
            );
          })}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 1,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 10,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: 110,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  crown: {
    fontSize: 16,
    marginRight: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    flex: 1,
  },
  stat: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    color: "#6b7280",
  },
  value: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1f2937",
  },
  disconnectText: {
    fontSize: 10,
    color: "#ef4444",
    marginBottom: 4,
  },
});
