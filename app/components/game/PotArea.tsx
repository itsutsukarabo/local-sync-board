import React, { useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  cancelAnimation,
  runOnJS,
  Easing,
  interpolateColor,
} from "react-native-reanimated";
import { PotState, Variable } from "../../types";

interface PotAreaProps {
  pot: PotState;
  variables: Variable[];
  isHighlighted?: boolean;
  onDragStart?: (potId: string, x: number, y: number) => void;
  onDragUpdate?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onPositionMeasured?: (x: number, y: number) => void;
}

const HIGHLIGHT_SPRING = { damping: 15, stiffness: 150 };

export default function PotArea({
  pot,
  variables,
  isHighlighted = false,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  onPositionMeasured,
}: PotAreaProps) {
  const viewRef = useRef<View>(null);
  const centerX = useSharedValue(0);
  const centerY = useSharedValue(0);

  // 供託金のいずれかの変数が 0 より大きいか
  const isActive = Object.values(pot).some((v) => (v || 0) > 0);

  // ドラッグハイライトアニメーション
  const highlightProgress = useSharedValue(0);

  // アクティブ/非アクティブ遷移 (0=inactive, 1=active)
  const activeSV = useSharedValue(isActive ? 1 : 0);
  // パルスアニメーション (0→1→0 を繰り返す)
  const pulseValue = useSharedValue(0);

  React.useEffect(() => {
    highlightProgress.value = withSpring(
      isHighlighted ? 1 : 0,
      HIGHLIGHT_SPRING
    );
  }, [isHighlighted, highlightProgress]);

  useEffect(() => {
    if (isActive) {
      activeSV.value = withTiming(1, { duration: 400 });
      pulseValue.value = withRepeat(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    } else {
      activeSV.value = withTiming(0, { duration: 400 });
      cancelAnimation(pulseValue);
      pulseValue.value = withTiming(0, { duration: 300 });
    }
  }, [isActive, activeSV, pulseValue]);

  const animatedCardStyle = useAnimatedStyle(() => {
    const highlight = highlightProgress.value;
    const active = activeSV.value;
    const pulse = pulseValue.value;

    // ドラッグハイライト中は専用スタイルで上書き
    if (highlight > 0) {
      return {
        transform: [{ scale: 1 + highlight * 0.1 }],
        borderWidth: 2,
        borderColor: highlight > 0.5 ? "#3b82f6" : "#f59e0b",
        backgroundColor: "#fef3c7",
        shadowColor: "#000",
        shadowOpacity: 0.2 + highlight * 0.2,
        shadowRadius: 4 + highlight * 8,
        elevation: 4 + highlight * 4,
      };
    }

    // inactive (#d1d5db gray-300) ↔ active (#f59e0b amber-500) の補間
    const borderColor = interpolateColor(active, [0, 1], [
      "#d1d5db",
      "#f59e0b",
    ]);

    // inactive (transparent) ↔ active (amber-100) の補間
    const backgroundColor = interpolateColor(active, [0, 1], [
      "rgba(255, 255, 255, 0)",
      "rgba(254, 243, 199, 1)",
    ]);

    return {
      transform: [{ scale: 1 }],
      // borderWidth: inactive=1px / active=2~2.5px (pulse で微振動)
      borderWidth: 1 + active * (1 + pulse * 0.5),
      borderColor,
      backgroundColor,
      // 影: active 時だけゴールドのグロー、pulse で膨張・収縮
      shadowColor: "#f59e0b",
      shadowOpacity: active * (0.3 + pulse * 0.4),
      shadowRadius: active * (5 + pulse * 10),
      elevation: 1 + active * (3 + pulse * 5),
    };
  });

  // Pot の中心座標を測定
  const measurePosition = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.measureInWindow((x, y, width, height) => {
        const cx = x + width / 2;
        const cy = y + height / 2;
        centerX.value = cx;
        centerY.value = cy;

        if (onPositionMeasured) {
          onPositionMeasured(cx, cy);
        }
      });
    }
  }, [onPositionMeasured]);

  useEffect(() => {
    const timer = setTimeout(measurePosition, 100);
    return () => clearTimeout(timer);
  }, [measurePosition]);

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onStart((event) => {
      "worklet";
      if (onDragStart) {
        runOnJS(onDragStart)("__pot__", event.absoluteX, event.absoluteY);
      }
    })
    .onUpdate((event) => {
      "worklet";
      if (onDragUpdate) {
        runOnJS(onDragUpdate)(event.absoluteX, event.absoluteY);
      }
    })
    .onEnd((event) => {
      "worklet";
      if (onDragEnd) {
        runOnJS(onDragEnd)(event.absoluteX, event.absoluteY);
      }
    });

  return (
    <View style={styles.container} ref={viewRef}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.potCard, animatedCardStyle]}>
          <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
            供託金
          </Text>
          {variables.map((v) => {
            const value = pot[v.key] || 0;
            if (variables.length === 1) {
              return (
                <Text
                  key={v.key}
                  style={[styles.score, isActive ? styles.textActive : styles.textInactive]}
                >
                  {value.toLocaleString()}
                </Text>
              );
            }
            return (
              <Text
                key={v.key}
                style={[styles.scoreMulti, isActive ? styles.textActive : styles.textInactive]}
              >
                {v.label}: {value.toLocaleString()}
              </Text>
            );
          })}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -45,
    marginLeft: -55,
    width: 110,
    height: 90,
    justifyContent: "center",
    alignItems: "center",
  },
  potCard: {
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    // shadowOffset だけ静的に保持。他の shadow 系はアニメーションスタイルで制御。
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  labelActive: {
    color: "#92400e", // amber-900
  },
  labelInactive: {
    color: "#9ca3af", // gray-400
  },
  score: {
    fontSize: 20,
    fontWeight: "bold",
  },
  scoreMulti: {
    fontSize: 14,
    fontWeight: "600",
  },
  textActive: {
    color: "#92400e", // amber-900
  },
  textInactive: {
    color: "#9ca3af", // gray-400
  },
});
