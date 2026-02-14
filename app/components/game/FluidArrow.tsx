import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  SharedValue,
  interpolate,
} from "react-native-reanimated";
import type { DragPhase } from "../../hooks/useDragInteraction";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedSvg = Animated.createAnimatedComponent(Svg);

interface FluidArrowProps {
  phase: DragPhase;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  currentX: SharedValue<number>;
  currentY: SharedValue<number>;
  snapTargetId: SharedValue<string>;
  containerWidth: number;
  containerHeight: number;
}

/** 矢印の太さ設定 */
const BASE_WIDTH = 22; // 根元の太さ（半径）
const TIP_WIDTH = 3; // 先端の太さ（半径）
const MAX_TENSION_DISTANCE = 300; // これ以上離れると最細

/**
 * 流体（リキッド）矢印コンポーネント
 * ベジェ曲線で雫型のシルエットを描画し、距離に応じた張力を表現
 */
export default function FluidArrow({
  phase,
  startX,
  startY,
  currentX,
  currentY,
  snapTargetId,
  containerWidth,
  containerHeight,
}: FluidArrowProps) {
  // Path の d 属性をアニメーション付きで計算
  const animatedProps = useAnimatedProps(() => {
    const sx = startX.value;
    const sy = startY.value;
    const ex = currentX.value;
    const ey = currentY.value;

    const dx = ex - sx;
    const dy = ey - sy;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) {
      // 距離が短すぎる場合は非表示
      return { d: "" };
    }

    // 方向ベクトル（正規化）
    const nx = dx / distance;
    const ny = dy / distance;

    // 法線ベクトル（直交方向）
    const px = -ny;
    const py = nx;

    // 張力: 距離が遠いほど中間が細くなる
    const tension = Math.min(distance / MAX_TENSION_DISTANCE, 1);
    const midWidth = interpolate(tension, [0, 1], [BASE_WIDTH, TIP_WIDTH + 2]);

    // 中間点
    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2;

    // 各ポイント（太さを法線方向に適用）
    // 始点の太い部分
    const s1x = sx + px * BASE_WIDTH;
    const s1y = sy + py * BASE_WIDTH;
    const s2x = sx - px * BASE_WIDTH;
    const s2y = sy - py * BASE_WIDTH;

    // 中間の細い部分
    const m1x = midX + px * midWidth;
    const m1y = midY + py * midWidth;
    const m2x = midX - px * midWidth;
    const m2y = midY - py * midWidth;

    // 先端
    const tipX = ex;
    const tipY = ey;

    // 始点オフセット（カードの端から出るように）
    const startOffset = 10;
    const osx = sx + nx * startOffset;
    const osy = sy + ny * startOffset;

    // ベジェ曲線のパス（雫型）
    // 上側: 始点太い → 中間 → 先端（細い）
    // 下側: 先端 → 中間 → 始点太い（戻り）
    const d = [
      // 始点上側からスタート
      `M ${osx + px * BASE_WIDTH} ${osy + py * BASE_WIDTH}`,
      // 上カーブ: 始点 → 中間
      `Q ${(osx + midX) / 2 + px * (BASE_WIDTH + midWidth) / 2} ${
        (osy + midY) / 2 + py * (BASE_WIDTH + midWidth) / 2
      } ${m1x} ${m1y}`,
      // 上カーブ: 中間 → 先端
      `Q ${(midX + tipX) / 2 + px * (midWidth + TIP_WIDTH) / 2} ${
        (midY + tipY) / 2 + py * (midWidth + TIP_WIDTH) / 2
      } ${tipX + px * TIP_WIDTH} ${tipY + py * TIP_WIDTH}`,
      // 先端を閉じる
      `L ${tipX} ${tipY}`,
      `L ${tipX - px * TIP_WIDTH} ${tipY - py * TIP_WIDTH}`,
      // 下カーブ: 先端 → 中間
      `Q ${(midX + tipX) / 2 - px * (midWidth + TIP_WIDTH) / 2} ${
        (midY + tipY) / 2 - py * (midWidth + TIP_WIDTH) / 2
      } ${m2x} ${m2y}`,
      // 下カーブ: 中間 → 始点
      `Q ${(osx + midX) / 2 - px * (BASE_WIDTH + midWidth) / 2} ${
        (osy + midY) / 2 - py * (BASE_WIDTH + midWidth) / 2
      } ${osx - px * BASE_WIDTH} ${osy - py * BASE_WIDTH}`,
      // 始点の丸みを閉じる（半円弧）
      `A ${BASE_WIDTH} ${BASE_WIDTH} 0 0 1 ${osx + px * BASE_WIDTH} ${
        osy + py * BASE_WIDTH
      }`,
      "Z",
    ].join(" ");

    return { d };
  });

  // スナップ中はアクセントカラー
  const fillAnimatedProps = useAnimatedProps(() => {
    const isSnapped = snapTargetId.value !== "";
    return {
      opacity: isSnapped ? 0.55 : 0.4,
    };
  });

  if (phase === "idle") return null;
  if (containerWidth === 0 || containerHeight === 0) return null;

  return (
    <Svg
      style={styles.overlay}
      width={containerWidth}
      height={containerHeight}
      viewBox={`0 0 ${containerWidth} ${containerHeight}`}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
          <Stop offset="100%" stopColor="#2563eb" stopOpacity="0.8" />
        </LinearGradient>
        <LinearGradient id="arrowGradientSnap" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#34d399" stopOpacity="0.6" />
          <Stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
        </LinearGradient>
      </Defs>
      <AnimatedPath
        animatedProps={animatedProps}
        fill="url(#arrowGradient)"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 1000,
  },
});
