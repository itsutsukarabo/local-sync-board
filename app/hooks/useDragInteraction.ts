import { useCallback, useRef, useState } from "react";
import { LayoutRectangle, Platform } from "react-native";
import {
  useSharedValue,
  withSpring,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

/** ドラッグの状態フェーズ */
export type DragPhase = "idle" | "dragging" | "retracting";

/** ドラッグ中の矢印描画に必要な情報 */
export interface DragVisualState {
  phase: DragPhase;
  fromPlayerId: string | null;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  currentX: SharedValue<number>;
  currentY: SharedValue<number>;
  /** スナップ対象のプレイヤーID（吸着中） */
  snapTargetId: SharedValue<string>;
}

/** カード/Potの中心座標（絶対座標） */
export interface TargetPosition {
  x: number;
  y: number;
}

/** useDragInteraction の戻り値 */
export interface DragInteraction {
  /** ドラッグ表示用の状態 */
  visual: DragVisualState;
  /** ドラッグ開始ハンドラ（MahjongPlayerCard, PotArea から呼ばれる） */
  handleDragStart: (playerId: string, absX: number, absY: number) => void;
  /** ドラッグ更新ハンドラ */
  handleDragUpdate: (absX: number, absY: number) => void;
  /** ドラッグ終了ハンドラ */
  handleDragEnd: (absX: number, absY: number) => void;
  /** カード位置の登録 */
  registerCardPosition: (id: string, absX: number, absY: number) => void;
  /** Pot位置の登録 */
  registerPotPosition: (absX: number, absY: number) => void;
  /** コンテナレイアウト変更ハンドラ */
  onContainerLayout: (layout: LayoutRectangle) => void;
  /** コンテナの絶対位置を設定（measureInWindow結果） */
  setContainerOffset: (x: number, y: number) => void;
  /** コンテナサイズ */
  containerSize: { width: number; height: number };
  /** 現在のスナップ対象ID（React state、カードのハイライトに使用） */
  snapTargetIdState: string | null;
}

/** スナップ判定の閾値 */
const SNAP_ENTER_RADIUS = 60;
const SNAP_EXIT_RADIUS = 70; // ヒステリシスでチラつき防止
const DROP_RADIUS = 80;

/** スナップ時のスプリング設定 */
const SNAP_SPRING_CONFIG = {
  damping: 20,
  stiffness: 300,
  mass: 0.5,
};

/** キャンセル収縮時のスプリング設定 */
const RETRACT_SPRING_CONFIG = {
  damping: 12,
  stiffness: 200,
  mass: 0.8,
};

/** Haptics フィードバック（Web では無視） */
function hapticSnap() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function hapticDropSuccess() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function useDragInteraction(options: {
  isPotEnabled: boolean;
  isProcessing: boolean;
  onDrop: (fromId: string, toId: string) => void;
  onSnapEnter?: (targetId: string) => void;
  onSnapExit?: () => void;
}): DragInteraction {
  const { isPotEnabled, isProcessing, onDrop, onSnapEnter, onSnapExit } =
    options;

  // --- Shared values (worklet で操作可能、60fps) ---
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const currentX = useSharedValue(0);
  const currentY = useSharedValue(0);
  const snapTargetId = useSharedValue("");

  // --- React state (UI制御用) ---
  const [phase, setPhase] = useState<DragPhase>("idle");
  const [fromPlayerId, setFromPlayerId] = useState<string | null>(null);
  const [snapTargetIdState, setSnapTargetIdState] = useState<string | null>(
    null
  );
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // --- Ref (高速アクセス) ---
  const containerOffsetRef = useRef({ x: 0, y: 0 });
  const cardPositionsRef = useRef<Record<string, TargetPosition>>({});
  const potPositionRef = useRef<TargetPosition>({ x: 0, y: 0 });
  const fromPlayerIdRef = useRef<string | null>(null);
  const currentSnapRef = useRef<string | null>(null);

  // --- コンテナレイアウト ---
  const onContainerLayout = useCallback((layout: LayoutRectangle) => {
    setContainerSize({ width: layout.width, height: layout.height });
  }, []);

  const setContainerOffsetFn = useCallback((x: number, y: number) => {
    containerOffsetRef.current = { x, y };
  }, []);

  // --- カード/Pot位置登録 ---
  const registerCardPosition = useCallback(
    (id: string, absX: number, absY: number) => {
      cardPositionsRef.current[id] = { x: absX, y: absY };
    },
    []
  );

  const registerPotPosition = useCallback((absX: number, absY: number) => {
    potPositionRef.current = { x: absX, y: absY };
  }, []);

  // --- 絶対座標 → コンテナ相対座標 ---
  const toRelative = useCallback(
    (absX: number, absY: number) => ({
      x: absX - containerOffsetRef.current.x,
      y: absY - containerOffsetRef.current.y,
    }),
    []
  );

  // --- 最近接ターゲットを検索 ---
  const findNearestTarget = useCallback(
    (
      relX: number,
      relY: number,
      excludeId: string | null
    ): { id: string; distance: number; relPos: TargetPosition } | null => {
      let nearest: {
        id: string;
        distance: number;
        relPos: TargetPosition;
      } | null = null;

      // プレイヤーカード
      for (const [id, absPos] of Object.entries(cardPositionsRef.current)) {
        if (id === excludeId) continue;
        const rel = toRelative(absPos.x, absPos.y);
        const dist = Math.sqrt(
          Math.pow(relX - rel.x, 2) + Math.pow(relY - rel.y, 2)
        );
        if (!nearest || dist < nearest.distance) {
          nearest = { id, distance: dist, relPos: rel };
        }
      }

      // Pot
      if (isPotEnabled) {
        const potRel = toRelative(
          potPositionRef.current.x,
          potPositionRef.current.y
        );
        const potDist = Math.sqrt(
          Math.pow(relX - potRel.x, 2) + Math.pow(relY - potRel.y, 2)
        );
        if (!nearest || potDist < nearest.distance) {
          nearest = { id: "__pot__", distance: potDist, relPos: potRel };
        }
      }

      return nearest;
    },
    [isPotEnabled, toRelative]
  );

  // --- ドラッグ開始 ---
  const handleDragStart = useCallback(
    (playerId: string, absX: number, absY: number) => {
      if (isProcessing) return;

      const rel = toRelative(absX, absY);

      startX.value = rel.x;
      startY.value = rel.y;
      currentX.value = rel.x;
      currentY.value = rel.y;
      snapTargetId.value = "";

      fromPlayerIdRef.current = playerId;
      currentSnapRef.current = null;
      setFromPlayerId(playerId);
      setSnapTargetIdState(null);
      setPhase("dragging");

      // [DEBUG] Phase6 デバッグログ
      console.log(`[Drag] START from=${playerId} abs=(${absX.toFixed(0)},${absY.toFixed(0)}) rel=(${rel.x.toFixed(0)},${rel.y.toFixed(0)}) offset=(${containerOffsetRef.current.x.toFixed(0)},${containerOffsetRef.current.y.toFixed(0)})`);
    },
    [isProcessing, toRelative, startX, startY, currentX, currentY, snapTargetId]
  );

  // --- ドラッグ更新 ---
  const handleDragUpdate = useCallback(
    (absX: number, absY: number) => {
      const rel = toRelative(absX, absY);

      // 最近接ターゲット判定
      const nearest = findNearestTarget(
        rel.x,
        rel.y,
        fromPlayerIdRef.current
      );
      const prevSnap = currentSnapRef.current;

      if (nearest) {
        const isCurrentlySnapped = prevSnap === nearest.id;
        const threshold = isCurrentlySnapped
          ? SNAP_EXIT_RADIUS
          : SNAP_ENTER_RADIUS;

        if (nearest.distance < threshold) {
          // スナップ中: 先端をターゲット中央にスプリング移動
          if (!isCurrentlySnapped) {
            currentSnapRef.current = nearest.id;
            snapTargetId.value = nearest.id;
            setSnapTargetIdState(nearest.id);
            hapticSnap();
            onSnapEnter?.(nearest.id);
            // [DEBUG] Phase6 デバッグログ
            console.log(`[Drag] SNAP target=${nearest.id} dist=${nearest.distance.toFixed(0)}`);
          }
          currentX.value = withSpring(
            nearest.relPos.x,
            SNAP_SPRING_CONFIG
          );
          currentY.value = withSpring(
            nearest.relPos.y,
            SNAP_SPRING_CONFIG
          );
          return;
        }
      }

      // スナップ解除
      if (prevSnap) {
        currentSnapRef.current = null;
        snapTargetId.value = "";
        setSnapTargetIdState(null);
        onSnapExit?.();
      }

      // 通常追従
      currentX.value = rel.x;
      currentY.value = rel.y;
    },
    [
      toRelative,
      findNearestTarget,
      currentX,
      currentY,
      snapTargetId,
      onSnapEnter,
      onSnapExit,
    ]
  );

  // --- ドラッグ終了 ---
  const handleDragEnd = useCallback(
    (absX: number, absY: number) => {
      const rel = toRelative(absX, absY);
      const fromId = fromPlayerIdRef.current;

      if (!fromId) {
        setPhase("idle");
        setFromPlayerId(null);
        return;
      }

      // ドロップ先判定（スナップ中ならスナップ先を優先）
      let dropTarget: string | null = currentSnapRef.current;

      if (!dropTarget) {
        // スナップなしの場合も従来の距離判定
        const nearest = findNearestTarget(rel.x, rel.y, fromId);
        if (nearest && nearest.distance < DROP_RADIUS) {
          dropTarget = nearest.id;
        }
      }

      if (dropTarget) {
        // ドロップ成功
        // [DEBUG] Phase6 デバッグログ
        console.log(`[Drag] DROP from=${fromId} to=${dropTarget}`);
        hapticDropSuccess();
        onDrop(fromId, dropTarget);
        setPhase("idle");
        setFromPlayerId(null);
        setSnapTargetIdState(null);
        currentSnapRef.current = null;
        snapTargetId.value = "";
      } else {
        // キャンセル: ゴムバンド収縮アニメーション
        // [DEBUG] Phase6 デバッグログ
        console.log(`[Drag] CANCEL (retracting)`);
        setSnapTargetIdState(null);
        currentSnapRef.current = null;
        snapTargetId.value = "";
        setPhase("retracting");

        currentX.value = withSpring(
          startX.value,
          RETRACT_SPRING_CONFIG,
          (finished) => {
            if (finished) {
              runOnJS(setPhase)("idle");
              runOnJS(setFromPlayerId)(null);
            }
          }
        );
        currentY.value = withSpring(startY.value, RETRACT_SPRING_CONFIG);
      }
    },
    [
      toRelative,
      findNearestTarget,
      onDrop,
      startX,
      startY,
      currentX,
      currentY,
      snapTargetId,
    ]
  );

  return {
    visual: {
      phase,
      fromPlayerId,
      startX,
      startY,
      currentX,
      currentY,
      snapTargetId,
    },
    handleDragStart,
    handleDragUpdate,
    handleDragEnd,
    registerCardPosition,
    registerPotPosition,
    onContainerLayout,
    setContainerOffset: setContainerOffsetFn,
    containerSize,
    snapTargetIdState,
  };
}
