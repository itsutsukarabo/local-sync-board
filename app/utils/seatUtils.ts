import { SeatPosition, SeatMap, SeatInfo } from "../types";

/**
 * 座席インデックスから座席位置を取得
 * @param seatIndex - 座席インデックス (0: Bottom, 1: Right, 2: Top, 3: Left)
 * @returns 座席位置
 */
export function getSeatPositionFromIndex(seatIndex: number): SeatPosition {
  const positions: SeatPosition[] = ["bottom", "right", "top", "left"];
  return positions[seatIndex] || "bottom";
}

/**
 * 座席位置から座席インデックスを取得
 * @param position - 座席位置
 * @returns 座席インデックス
 */
export function getSeatIndexFromPosition(position: SeatPosition): number {
  const positions: SeatPosition[] = ["bottom", "right", "top", "left"];
  return positions.indexOf(position);
}

/**
 * 座席配列から座席マップを生成（視点回転あり）
 * 現在のユーザーが常に画面下（Bottom）に来るように回転
 * @param seats - 座席配列 [Bottom(0), Right(1), Top(2), Left(3)]
 * @param currentUserId - 現在のユーザーID
 * @returns 座席配置マップ
 */
export function createSeatMapFromSeats(
  seats: (SeatInfo | null)[],
  currentUserId: string
): SeatMap {
  const seatMap: SeatMap = {};

  // 現在のユーザーの座席インデックスを見つける
  const currentUserSeatIndex = seats.findIndex(
    (seat) => seat && seat.userId === currentUserId
  );

  // ユーザーが座席に座っていない場合は空のマップを返す
  if (currentUserSeatIndex === -1) {
    return seatMap;
  }

  // 回転量を計算（現在のユーザーをBottomに配置するため）
  const rotation = currentUserSeatIndex;

  // 各座席を回転させて配置
  seats.forEach((seat, index) => {
    if (seat && seat.userId) {
      // 回転後のインデックスを計算
      const rotatedIndex = (index - rotation + 4) % 4;
      const position = getSeatPositionFromIndex(rotatedIndex);
      seatMap[seat.userId] = position;
    }
  });

  return seatMap;
}

/**
 * プレイヤーを座席に配置（旧バージョン - 後方互換性のため残す）
 * 自分（現在のユーザー）を常に画面下（Bottom）に配置
 * @param playerIds - プレイヤーIDの配列
 * @param currentUserId - 現在のユーザーID
 * @returns 座席配置マップ
 */
export function assignSeats(
  playerIds: string[],
  currentUserId: string
): SeatMap {
  const seatMap: SeatMap = {};

  // 自分を下に配置
  seatMap[currentUserId] = "bottom";

  // 他のプレイヤーを配置
  const otherPlayers = playerIds.filter((id) => id !== currentUserId);

  if (otherPlayers.length === 2) {
    // 3人麻雀: 上と右のみ使用（左は空席）
    seatMap[otherPlayers[0]] = "top";
    seatMap[otherPlayers[1]] = "right";
  } else if (otherPlayers.length >= 3) {
    // 4人麻雀: 全席使用（時計回り: 上、左、右）
    const positions: SeatPosition[] = ["right", "top", "left"];
    otherPlayers.forEach((playerId, index) => {
      if (index < positions.length) {
        seatMap[playerId] = positions[index];
      }
    });
  } else if (otherPlayers.length === 1) {
    // 2人の場合: 対面に配置
    seatMap[otherPlayers[0]] = "top";
  }

  return seatMap;
}

/**
 * 座席位置からスタイルを取得
 * @param position - 座席位置
 * @returns スタイルオブジェクト
 */
export function getSeatStyle(position: SeatPosition) {
  const baseStyle = {
    position: "absolute" as const,
    width: 110,
  };

  switch (position) {
    case "bottom":
      return {
        ...baseStyle,
        bottom: 10,
        left: "50%" as const,
        marginLeft: -55,
      };
    case "top":
      return {
        ...baseStyle,
        top: 10,
        left: "50%" as const,
        marginLeft: -55,
      };
    case "left":
      return {
        ...baseStyle,
        left: 10,
        top: "50%" as const,
        marginTop: -40,
      };
    case "right":
      return {
        ...baseStyle,
        right: 10,
        top: "50%" as const,
        marginTop: -40,
      };
  }
}
