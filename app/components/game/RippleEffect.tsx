import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

interface RippleEffectProps {
  /** ドラッグ中は非表示 */
  isDragging?: boolean;
}

const RIPPLE_DURATION = 2000; // 1サイクルの時間 (ms)
const RIPPLE_INTERVAL = 3000; // 繰り返し間隔 (ms)
const RIPPLE_MAX_SCALE = 2.2;

/**
 * 自席カードの周囲に表示する波紋エフェクト
 * 「外に向かって何かできそう」という気づきを与える
 */
export default function RippleEffect({ isDragging = false }: RippleEffectProps) {
  const ripple1 = useSharedValue(0);
  const ripple2 = useSharedValue(0);

  useEffect(() => {
    if (isDragging) {
      ripple1.value = 0;
      ripple2.value = 0;
      return;
    }

    // 波紋1: 即座に開始
    ripple1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 0 }),
        withDelay(RIPPLE_INTERVAL - RIPPLE_DURATION, withTiming(0, { duration: 0 }))
      ),
      -1, // 無限ループ
      false
    );

    // 波紋2: 少し遅れて開始
    ripple2.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 0 }),
          withDelay(RIPPLE_INTERVAL - RIPPLE_DURATION, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      )
    );
  }, [isDragging, ripple1, ripple2]);

  const rippleStyle1 = useAnimatedStyle(() => ({
    opacity: (1 - ripple1.value) * 0.3,
    transform: [{ scale: 1 + ripple1.value * (RIPPLE_MAX_SCALE - 1) }],
  }));

  const rippleStyle2 = useAnimatedStyle(() => ({
    opacity: (1 - ripple2.value) * 0.2,
    transform: [{ scale: 1 + ripple2.value * (RIPPLE_MAX_SCALE - 1) }],
  }));

  if (isDragging) return null;

  return (
    <>
      <Animated.View style={[styles.ripple, rippleStyle1]} pointerEvents="none" />
      <Animated.View style={[styles.ripple, rippleStyle2]} pointerEvents="none" />
    </>
  );
}

const styles = StyleSheet.create({
  ripple: {
    position: "absolute",
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#3b82f6",
    zIndex: -1,
  },
});
