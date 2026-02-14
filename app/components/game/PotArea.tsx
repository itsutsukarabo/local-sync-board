import React, { useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
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

  // ハイライトアニメーション
  const highlightProgress = useSharedValue(0);

  React.useEffect(() => {
    highlightProgress.value = withSpring(
      isHighlighted ? 1 : 0,
      HIGHLIGHT_SPRING
    );
  }, [isHighlighted, highlightProgress]);

  const highlightStyle = useAnimatedStyle(() => {
    const scale = 1 + highlightProgress.value * 0.1;
    return {
      transform: [{ scale }],
      borderColor:
        highlightProgress.value > 0.5 ? "#3b82f6" : "#f59e0b",
      shadowRadius: 4 + highlightProgress.value * 8,
      shadowOpacity: 0.2 + highlightProgress.value * 0.2,
    };
  });

  // Potの中心座標を測定
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

  // 長押しでドラッグ開始
  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      "worklet";
      if (onDragStart) {
        runOnJS(onDragStart)("__pot__", centerX.value, centerY.value);
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      "worklet";
      if (onDragUpdate) {
        runOnJS(onDragUpdate)(
          centerX.value + event.translationX,
          centerY.value + event.translationY
        );
      }
    })
    .onEnd((event) => {
      "worklet";
      if (onDragEnd) {
        runOnJS(onDragEnd)(
          centerX.value + event.translationX,
          centerY.value + event.translationY
        );
      }
    });

  const gesture = Gesture.Simultaneous(longPress, pan);

  return (
    <View style={styles.container} ref={viewRef}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.potCard, highlightStyle]}>
          <Text style={styles.label}>供託金</Text>
          {variables.map((v) => {
            const value = pot[v.key] || 0;
            if (variables.length === 1) {
              return (
                <Text key={v.key} style={styles.score}>
                  {value.toLocaleString()}
                </Text>
              );
            }
            return (
              <Text key={v.key} style={styles.scoreMulti}>
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
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    padding: 12,
    borderWidth: 2,
    borderColor: "#f59e0b",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  label: {
    fontSize: 12,
    color: "#92400e",
    fontWeight: "600",
    marginBottom: 4,
  },
  score: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#92400e",
  },
  scoreMulti: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400e",
  },
});
