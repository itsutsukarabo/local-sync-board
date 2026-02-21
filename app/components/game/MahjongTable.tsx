import React, { useState, useCallback, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  GameState,
  Variable,
  PotAction,
  SeatInfo,
  SeatPosition,
  ConnectionStatus,
} from "../../types";
import {
  getSeatPositionFromIndex,
} from "../../utils/seatUtils";
import { useDragInteraction } from "../../hooks/useDragInteraction";
import MahjongPlayerCard from "./MahjongPlayerCard";
import PotArea from "./PotArea";
import PaymentModal from "./PaymentModal";
import PotActionSelectModal from "./PotActionSelectModal";
import PlayerInfoModal from "./PlayerInfoModal";
import EmptySeat from "./EmptySeat";
import FluidArrow from "./FluidArrow";
import CounterCard from "./CounterCard";

interface MahjongTableProps {
  gameState: GameState;
  variables: Variable[];
  currentUserId: string;
  hostUserId: string;
  coHostIds?: string[];
  seats: (SeatInfo | null)[]; // 座席配列
  onTransfer: (fromId: string, toId: string, transfers: { variable: string; amount: number }[]) => Promise<void>;
  onJoinSeat: (seatIndex: number) => Promise<void>; // 座席に着席
  onJoinFakeSeat?: (seatIndex: number) => Promise<void>; // 架空ユーザー着席（ホスト長押し）
  onForceLeave?: (targetUserId: string) => Promise<void>; // ユーザー強制離席（ゲスト含む）
  isPotEnabled?: boolean;
  potActions?: PotAction[];
  connectionStatuses?: Map<string, ConnectionStatus>;
  isProcessing?: boolean;
  isJoining?: boolean;
  joiningGuestSeats?: Set<number>;
  counterValue?: number; // undefined = カウンター非表示
  canEditCounter?: boolean;
  onCounterCommit?: (expected: number, newVal: number) => Promise<{ conflictValue?: number }>;
}

export default function MahjongTable({
  gameState,
  variables,
  currentUserId,
  hostUserId,
  coHostIds,
  seats,
  onTransfer,
  onJoinSeat,
  onJoinFakeSeat,
  onForceLeave,
  isPotEnabled = true,
  potActions = [],
  connectionStatuses,
  isProcessing = false,
  isJoining = false,
  joiningGuestSeats,
  counterValue,
  canEditCounter,
  onCounterCommit,
}: MahjongTableProps) {
  const containerRef = useRef<View>(null);

  const [paymentModal, setPaymentModal] = useState<{
    visible: boolean;
    fromId: string;
    toId: string;
  } | null>(null);

  const [potActionModal, setPotActionModal] = useState<{
    visible: boolean;
    fromId: string;
  } | null>(null);

  const [playerInfoModal, setPlayerInfoModal] = useState<{
    visible: boolean;
    playerId: string;
    seatIndex: number;
  } | null>(null);

  const pot = gameState.__pot__ || { score: 0 };

  // 現在のユーザーが座席に座っているかチェック
  const isUserSeated = seats.some(
    (seat) => seat && seat.userId === currentUserId
  );
  const isHost = currentUserId === hostUserId || (coHostIds ?? []).includes(currentUserId);

  // --- ドロップ処理 ---
  const handleDrop = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      if (toId === "__pot__") {
        if (potActions.length === 0) {
          return;
        } else if (potActions.length === 1) {
          onTransfer(fromId, "__pot__", potActions[0].transfers);
        } else {
          setPotActionModal({ visible: true, fromId });
        }
      } else if (fromId === "__pot__") {
        const transfers = Object.entries(pot)
          .filter(([, value]) => (value || 0) > 0)
          .map(([variableKey, value]) => ({ variable: variableKey, amount: value as number }));
        if (transfers.length > 0) {
          onTransfer("__pot__", toId, transfers);
        }
      } else {
        setPaymentModal({ visible: true, fromId, toId });
      }
    },
    [potActions, pot, onTransfer]
  );

  // --- ドラッグインタラクション ---
  const drag = useDragInteraction({
    isPotEnabled,
    isProcessing,
    onDrop: handleDrop,
  });

  // --- コンテナの絶対位置を測定 ---
  const measureContainer = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.measureInWindow((x, y) => {
        drag.setContainerOffset(x, y);
      });
    }
  }, [drag]);

  // --- ドラッグ開始のラッパー（コンテナ位置を再測定してからドラッグ開始） ---
  const handleDragStart = useCallback(
    (playerId: string, absX: number, absY: number) => {
      if (containerRef.current) {
        containerRef.current.measureInWindow((x, y) => {
          drag.setContainerOffset(x, y);
          drag.handleDragStart(playerId, absX, absY);
        });
      } else {
        drag.handleDragStart(playerId, absX, absY);
      }
    },
    [drag]
  );

  const handleCardTap = useCallback(
    (playerId: string) => {
      const seatIndex = seats.findIndex((s) => s && s.userId === playerId);
      if (seatIndex !== -1) {
        setPlayerInfoModal({ visible: true, playerId, seatIndex });
      }
    },
    [seats]
  );

  const handlePaymentConfirm = useCallback(
    async (transfers: { variable: string; amount: number }[]) => {
      if (paymentModal) {
        await onTransfer(paymentModal.fromId, paymentModal.toId, transfers);
        setPaymentModal(null);
      }
    },
    [paymentModal, onTransfer]
  );

  const resolvePlayerName = (id: string): string => {
    if (id === "__pot__") return "供託金";
    return seats.find((s) => s?.userId === id)?.displayName ?? id;
  };

  // モーダル表示中のプレイヤー情報を取得
  const infoModalSeat = playerInfoModal
    ? seats[playerInfoModal.seatIndex]
    : null;
  const infoModalPlayerState = playerInfoModal
    ? gameState[playerInfoModal.playerId]
    : null;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View
        style={styles.table}
        ref={containerRef}
        onLayout={(e) => {
          drag.onContainerLayout(e.nativeEvent.layout);
          // レイアウト後にコンテナの絶対位置も測定
          measureContainer();
        }}
      >
        {/* 座席とプレイヤーカードを表示 */}
        {seats.map((seat, index) => {
          const currentUserSeatIndex = seats.findIndex(
            (s) => s && s.userId === currentUserId
          );

          let displayPosition: SeatPosition;
          if (currentUserSeatIndex !== -1) {
            const rotation = currentUserSeatIndex;
            const rotatedIndex = (index - rotation + 4) % 4;
            displayPosition = getSeatPositionFromIndex(rotatedIndex);
          } else {
            displayPosition = getSeatPositionFromIndex(index);
          }

          if (!seat || !seat.userId) {
            // 着席済み非ホスト or 通常着席API待ち中 → 非表示
            if ((isUserSeated && !isHost) || isJoining) return null;

            return (
              <EmptySeat
                key={`empty-${index}`}
                position={displayPosition}
                seatIndex={index}
                onJoinSeat={onJoinSeat}
                onLongPressJoinFake={isHost ? onJoinFakeSeat : undefined}
                isUserSeated={isUserSeated}
                isJoining={joiningGuestSeats?.has(index) ?? false}
              />
            );
          }

          const playerId = seat.userId;
          const playerState = gameState[playerId];

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
              displayName={seat.displayName}
              disconnectedAt={connectionStatuses?.get(playerId)?.disconnectedAt ?? null}
              isHostUser={isHost}
              isFakePlayer={seat.isFake === true}
              isHighlighted={drag.snapTargetIdState === playerId}
              isDragging={drag.visual.phase !== "idle"}
              onTap={handleCardTap}
              onDragStart={handleDragStart}
              onDragUpdate={drag.handleDragUpdate}
              onDragEnd={drag.handleDragEnd}
              onPositionMeasured={(id, x, y) => {
                drag.registerCardPosition(id, x, y);
              }}
              onPositionUnmount={(id) => {
                drag.unregisterCardPosition(id);
              }}
            />
          );
        })}

        {/* 供託金エリア */}
        {isPotEnabled && (
          <PotArea
            pot={pot}
            variables={variables}
            isHighlighted={drag.snapTargetIdState === "__pot__"}
            onDragStart={handleDragStart}
            onDragUpdate={drag.handleDragUpdate}
            onDragEnd={drag.handleDragEnd}
            onPositionMeasured={(x, y) => {
              drag.registerPotPosition(x, y);
            }}
          />
        )}

        {/* カウンター */}
        {counterValue !== undefined && (
          <View style={styles.counterContainer}>
            <CounterCard
              serverValue={counterValue}
              canEdit={canEditCounter ?? false}
              onCommit={onCounterCommit ?? (() => Promise.resolve({}))}
            />
          </View>
        )}
      </View>

      {/* 流体矢印の描画 */}
      <FluidArrow
        phase={drag.visual.phase}
        startX={drag.visual.startX}
        startY={drag.visual.startY}
        currentX={drag.visual.currentX}
        currentY={drag.visual.currentY}
        snapTargetId={drag.visual.snapTargetId}
        containerWidth={drag.containerSize.width}
        containerHeight={drag.containerSize.height}
      />

      {/* 支払いモーダル */}
      {paymentModal && (
        <PaymentModal
          visible={paymentModal.visible}
          onClose={() => setPaymentModal(null)}
          onConfirm={handlePaymentConfirm}
          variables={variables}
          fromName={resolvePlayerName(paymentModal.fromId)}
          toName={resolvePlayerName(paymentModal.toId)}
          isProcessing={isProcessing}
        />
      )}

      {/* 供託操作選択モーダル */}
      {potActionModal && (
        <PotActionSelectModal
          visible={potActionModal.visible}
          actions={potActions}
          onSelect={(action) => {
            onTransfer(potActionModal.fromId, "__pot__", action.transfers);
            setPotActionModal(null);
          }}
          onClose={() => setPotActionModal(null)}
        />
      )}

      {/* プレイヤー情報モーダル */}
      {playerInfoModal && infoModalSeat && infoModalPlayerState && (
        <PlayerInfoModal
          visible={playerInfoModal.visible}
          onClose={() => setPlayerInfoModal(null)}
          playerId={playerInfoModal.playerId}
          displayName={infoModalSeat.displayName || playerInfoModal.playerId.slice(0, 8)}
          playerState={infoModalPlayerState}
          variables={variables}
          isFakePlayer={infoModalSeat.isFake === true}
          isHost={isHost}
          onForceLeave={
            isHost
              ? () => {
                  onForceLeave?.(playerInfoModal.playerId);
                }
              : undefined
          }
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
  counterContainer: {
    position: "absolute",
    bottom: 15,
    right: 12,
  },
});
