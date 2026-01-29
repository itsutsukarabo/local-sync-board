import React, { useState } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Svg, { Line, Polygon } from "react-native-svg";
import {
  GameState,
  Variable,
  PotAction,
  PotState,
  SeatInfo,
  SeatPosition,
} from "../../types";
import {
  createSeatMapFromSeats,
  getSeatPositionFromIndex,
  getSeatStyle,
} from "../../utils/seatUtils";
import MahjongPlayerCard from "./MahjongPlayerCard";
import PotArea from "./PotArea";
import PaymentModal from "./PaymentModal";
import PotActionSelectModal from "./PotActionSelectModal";
import EmptySeat from "./EmptySeat";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface MahjongTableProps {
  gameState: GameState;
  variables: Variable[];
  currentUserId: string;
  hostUserId: string;
  seats: (SeatInfo | null)[]; // 座席配列
  onTransfer: (fromId: string, toId: string, amount: number) => Promise<void>;
  onJoinSeat: (seatIndex: number) => Promise<void>; // 座席に着席
  isPotEnabled?: boolean;
  potActions?: PotAction[];
}

interface DragState {
  isDragging: boolean;
  fromPlayerId: string | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export default function MahjongTable({
  gameState,
  variables,
  currentUserId,
  hostUserId,
  seats,
  onTransfer,
  onJoinSeat,
  isPotEnabled = true,
  potActions = [],
}: MahjongTableProps) {
  const containerRef = React.useRef<View>(null);
  const [containerOffset, setContainerOffset] = React.useState({ x: 0, y: 0 });
  // ドラッグ中に使用する最新のオフセット（非同期更新対応）
  const currentOffsetRef = React.useRef({ x: 0, y: 0 });

  const [paymentModal, setPaymentModal] = useState<{
    visible: boolean;
    fromId: string;
    toId: string;
  } | null>(null);

  const [potActionModal, setPotActionModal] = useState<{
    visible: boolean;
    fromId: string;
  } | null>(null);

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    fromPlayerId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // 絶対座標で保存（containerOffsetを引く前の座標）
  const [cardPositionsAbsolute, setCardPositionsAbsolute] = useState<{
    [key: string]: { x: number; y: number };
  }>({});

  const [potPositionAbsolute, setPotPositionAbsolute] = useState<{
    x: number;
    y: number;
  }>({
    x: 0,
    y: 0,
  });

  // 相対座標に変換（使用時に計算）
  const cardPositions = React.useMemo(() => {
    const relative: { [key: string]: { x: number; y: number } } = {};
    for (const [id, pos] of Object.entries(cardPositionsAbsolute)) {
      relative[id] = {
        x: pos.x - containerOffset.x,
        y: pos.y - containerOffset.y,
      };
    }
    return relative;
  }, [cardPositionsAbsolute, containerOffset]);

  const potPosition = React.useMemo(
    () => ({
      x: potPositionAbsolute.x - containerOffset.x,
      y: potPositionAbsolute.y - containerOffset.y,
    }),
    [potPositionAbsolute, containerOffset]
  );

  // 座席配列から座席マップを生成（視点回転あり）
  const seatMap = createSeatMapFromSeats(seats, currentUserId);
  const pot = gameState.__pot__ || { score: 0 };

  // 現在のユーザーが座席に座っているかチェック
  const isUserSeated = seats.some(
    (seat) => seat && seat.userId === currentUserId
  );

  // コンテナの位置を測定（座席状態が変わったときも再測定）
  React.useEffect(() => {
    const measureContainer = () => {
      if (containerRef.current) {
        containerRef.current.measureInWindow((x, y) => {
          const newOffset = { x, y };
          setContainerOffset(newOffset);
          currentOffsetRef.current = newOffset;
        });
      }
    };

    // 複数回測定して確実に取得
    const timer1 = setTimeout(measureContainer, 100);
    const timer2 = setTimeout(measureContainer, 500);
    const timer3 = setTimeout(measureContainer, 1000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isUserSeated]); // 座席状態が変わったときも再測定

  const handleDragStart = (playerId: string, x: number, y: number) => {
    // ドラッグ開始時にコンテナ位置を再測定（スクロール対応）
    if (containerRef.current) {
      containerRef.current.measureInWindow((containerX, containerY) => {
        const newOffset = { x: containerX, y: containerY };
        setContainerOffset(newOffset);
        currentOffsetRef.current = newOffset; // refも更新

        // 新しいオフセットで座標を調整
        const adjustedX = x - containerX;
        const adjustedY = y - containerY;
        setDragState({
          isDragging: true,
          fromPlayerId: playerId,
          startX: adjustedX,
          startY: adjustedY,
          currentX: adjustedX,
          currentY: adjustedY,
        });
      });
    } else {
      // フォールバック：既存のオフセットを使用
      const adjustedX = x - containerOffset.x;
      const adjustedY = y - containerOffset.y;
      currentOffsetRef.current = containerOffset;
      setDragState({
        isDragging: true,
        fromPlayerId: playerId,
        startX: adjustedX,
        startY: adjustedY,
        currentX: adjustedX,
        currentY: adjustedY,
      });
    }
  };

  const handleDragUpdate = (x: number, y: number) => {
    // refから最新のオフセットを使用（ドラッグ開始時に測定した値）
    const adjustedX = x - currentOffsetRef.current.x;
    const adjustedY = y - currentOffsetRef.current.y;
    setDragState((prev) => ({
      ...prev,
      currentX: adjustedX,
      currentY: adjustedY,
    }));
  };

  const handleDragEnd = (x: number, y: number) => {
    // refから最新のオフセットを使用（ドラッグ開始時に測定した値）
    const adjustedX = x - currentOffsetRef.current.x;
    const adjustedY = y - currentOffsetRef.current.y;
    if (!dragState.fromPlayerId) {
      setDragState({
        isDragging: false,
        fromPlayerId: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      });
      return;
    }

    // ドロップ先を判定（調整済み座標を使用）
    let dropTarget: string | null = null;

    // Potへのドロップ判定
    if (isPotEnabled) {
      const distanceToPot = Math.sqrt(
        Math.pow(adjustedX - potPosition.x, 2) +
          Math.pow(adjustedY - potPosition.y, 2)
      );
      if (distanceToPot < 80) {
        dropTarget = "__pot__";
      }
    }

    // プレイヤーカードへのドロップ判定
    if (!dropTarget) {
      for (const [playerId, pos] of Object.entries(cardPositions)) {
        if (playerId === dragState.fromPlayerId) continue;
        const distance = Math.sqrt(
          Math.pow(adjustedX - pos.x, 2) + Math.pow(adjustedY - pos.y, 2)
        );
        if (distance < 80) {
          dropTarget = playerId;
          break;
        }
      }
    }

    // ドロップ処理
    if (dropTarget) {
      handleDrop(dragState.fromPlayerId, dropTarget);
    }

    // ドラッグ状態をリセット
    setDragState({
      isDragging: false,
      fromPlayerId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });
  };

  const handleDrop = (fromId: string, toId: string) => {
    if (toId === "__pot__") {
      if (potActions.length === 0) {
        return;
      } else if (potActions.length === 1) {
        // potActionsが1つの場合は即座に実行
        onTransfer(fromId, "__pot__", potActions[0].amount);
      } else {
        // potActionsが複数の場合は選択モーダルを表示
        setPotActionModal({ visible: true, fromId });
      }
    } else if (fromId === "__pot__") {
      // 供託回収: Pot全額を取得
      const totalPot = Object.values(pot).reduce(
        (sum, val) => sum + (val || 0),
        0
      );
      if (totalPot > 0) {
        onTransfer("__pot__", toId, totalPot);
      }
    } else {
      // 対人支払い: モーダルを表示
      setPaymentModal({ visible: true, fromId, toId });
    }
  };

  const handlePaymentConfirm = async (amount: number) => {
    if (paymentModal) {
      await onTransfer(paymentModal.fromId, paymentModal.toId, amount);
      setPaymentModal(null);
    }
  };

  // 矢印の先端を計算
  const calculateArrowHead = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLength = 15;
    const arrowAngle = Math.PI / 6;

    const point1X = x2 - arrowLength * Math.cos(angle - arrowAngle);
    const point1Y = y2 - arrowLength * Math.sin(angle - arrowAngle);
    const point2X = x2 - arrowLength * Math.cos(angle + arrowAngle);
    const point2Y = y2 - arrowLength * Math.sin(angle + arrowAngle);

    return `${point1X},${point1Y} ${x2},${y2} ${point2X},${point2Y}`;
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.table} ref={containerRef}>
        {/* 座席とプレイヤーカードを表示 */}
        {seats.map((seat, index) => {
          // 現在のユーザーの視点で座席位置を計算
          const currentUserSeatIndex = seats.findIndex(
            (s) => s && s.userId === currentUserId
          );

          // 視点回転を適用
          let displayPosition: SeatPosition;
          if (currentUserSeatIndex !== -1) {
            const rotation = currentUserSeatIndex;
            const rotatedIndex = (index - rotation + 4) % 4;
            displayPosition = getSeatPositionFromIndex(rotatedIndex);
          } else {
            // ユーザーが座席に座っていない場合は、そのままの位置
            displayPosition = getSeatPositionFromIndex(index);
          }

          // 座席が空の場合
          if (!seat || !seat.userId) {
            // ユーザーが既に座席に座っている場合は空席を表示しない
            if (isUserSeated) {
              return null;
            }
            return (
              <EmptySeat
                key={`empty-${index}`}
                position={displayPosition}
                seatIndex={index}
                onJoinSeat={onJoinSeat}
              />
            );
          }

          // プレイヤーが座っている場合
          const playerId = seat.userId;
          const playerState = gameState[playerId];

          // プレイヤーの状態が存在しない場合はスキップ
          if (
            !playerState ||
            typeof playerState !== "object" ||
            !("score" in playerState)
          ) {
            return null;
          }

          return (
            <MahjongPlayerCard
              key={playerId}
              playerId={playerId}
              playerState={playerState}
              variables={variables}
              isCurrentUser={playerId === currentUserId}
              isHost={playerId === hostUserId}
              position={displayPosition}
              onDragStart={handleDragStart}
              onDragUpdate={handleDragUpdate}
              onDragEnd={handleDragEnd}
              onPositionMeasured={(id, x, y) => {
                // 絶対座標のまま保存（相対座標への変換はuseMemoで行う）
                setCardPositionsAbsolute((prev) => ({
                  ...prev,
                  [id]: { x, y },
                }));
              }}
            />
          );
        })}

        {/* 供託金エリア */}
        {isPotEnabled && (
          <PotArea
            pot={pot}
            onDragStart={handleDragStart}
            onDragUpdate={handleDragUpdate}
            onDragEnd={handleDragEnd}
            onPositionMeasured={(x, y) => {
              // 絶対座標のまま保存（相対座標への変換はuseMemoで行う）
              setPotPositionAbsolute({ x, y });
            }}
          />
        )}
      </View>

      {/* 矢印の描画（画面全体に対して絶対配置） */}
      {dragState.isDragging && (
        <Svg
          style={styles.arrowOverlay}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}
          pointerEvents="none"
        >
          <Line
            x1={dragState.startX}
            y1={dragState.startY}
            x2={dragState.currentX}
            y2={dragState.currentY}
            stroke="#3b82f6"
            strokeWidth="3"
          />
          <Polygon
            points={calculateArrowHead(
              dragState.startX,
              dragState.startY,
              dragState.currentX,
              dragState.currentY
            )}
            fill="#3b82f6"
          />
        </Svg>
      )}

      {/* 支払いモーダル */}
      {paymentModal && (
        <PaymentModal
          visible={paymentModal.visible}
          onClose={() => setPaymentModal(null)}
          onConfirm={handlePaymentConfirm}
          maxAmount={(gameState[paymentModal.fromId]?.score as number) || 0}
        />
      )}

      {/* 供託操作選択モーダル */}
      {potActionModal && (
        <PotActionSelectModal
          visible={potActionModal.visible}
          actions={potActions}
          onSelect={(action) => {
            onTransfer(potActionModal.fromId, "__pot__", action.amount);
            setPotActionModal(null);
          }}
          onClose={() => setPotActionModal(null)}
        />
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  table: {
    flex: 1,
    position: "relative",
    paddingVertical: 20,
  },
  arrowOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});
