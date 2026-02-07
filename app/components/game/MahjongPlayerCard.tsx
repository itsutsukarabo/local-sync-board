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
  displayName?: string; // プレイヤーの表示名
  disconnectedAt?: number | null;
  isHostUser?: boolean; // 現在のユーザーがホストか
  isFakePlayer?: boolean; // このカードが架空ユーザーか
  onTap?: (playerId: string) => void;
  onDragStart: (playerId: string, x: number, y: number) => void;
  onDragUpdate: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onPositionMeasured?: (playerId: string, x: number, y: number) => void;
}

function formatDisconnectSeconds(disconnectedAt: number): string {
  const seconds = Math.floor((Date.now() - disconnectedAt) / 1000);
  return `${seconds}秒`;
}

export default function MahjongPlayerCard({
  playerId,
  playerState,
  variables,
  isCurrentUser,
  isHost,
  position,
  displayName,
  disconnectedAt,
  isHostUser,
  isFakePlayer,
  onTap,
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

  const panGesture = Gesture.Pan()
    .enabled(isCurrentUser || (isHostUser === true && isFakePlayer === true)) // 自分のカード + ホストは架空ユーザーもドラッグ可能
    .minDistance(10) // 10px以上動いたらパン開始（タップと区別）
    .onStart((event) => {
      "worklet";
      runOnJS(onDragStart)(playerId, event.absoluteX, event.absoluteY);
    })
    .onUpdate((event) => {
      "worklet";
      runOnJS(onDragUpdate)(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      "worklet";
      runOnJS(onDragEnd)(event.absoluteX, event.absoluteY);
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      "worklet";
      if (onTap) {
        runOnJS(onTap)(playerId);
      }
    });

  // Pan優先: 10px以上動いたらドラッグ、動かなければタップ
  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  const positionStyle = getSeatStyle(position);

  return (
    <View style={[styles.container, positionStyle]} ref={viewRef}>
      {/* 接続切れバッジ - カードの右上に配置 */}
      {disconnectedAt != null && (
        <View style={styles.disconnectBadge}>
          <Text style={styles.disconnectBadgeText}>
            {formatDisconnectSeconds(disconnectedAt)}
          </Text>
        </View>
      )}

      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.card}>
          <View style={styles.header}>
            {isHost && <Text style={styles.crown}>👑</Text>}
            <Text style={styles.name} numberOfLines={1}>
              {isCurrentUser ? "あなた" : displayName || `Player ${playerId.slice(0, 4)}`}
            </Text>
          </View>
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
    position: "relative",
  },
  disconnectBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 10,
    minWidth: 36,
    alignItems: "center",
  },
  disconnectBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
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
});
