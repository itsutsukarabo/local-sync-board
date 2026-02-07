/**
 * 精算ロジック（純粋関数）
 */

import {
  GameState,
  SeatInfo,
  Variable,
  SettlementConfig,
  Settlement,
  SettlementPlayerResult,
} from "../types";

/**
 * UUID生成（簡易版）
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 精算実行可能かチェック
 */
export function canExecuteSettlement(
  currentState: GameState,
  seats: (SeatInfo | null)[],
  variables: Variable[]
): { canExecute: boolean; reason?: string } {
  // 着席中プレイヤーを取得
  const seatedUserIds = seats
    .filter((s): s is SeatInfo => s !== null && s.userId !== null)
    .map((s) => s.userId!);

  if (seatedUserIds.length < 2) {
    return { canExecute: false, reason: "精算には2人以上の着席プレイヤーが必要です" };
  }

  // score変数の初期値を取得
  const scoreVar = variables.find((v) => v.key === "score");
  if (!scoreVar) {
    return { canExecute: false, reason: "score変数が定義されていません" };
  }

  // 合計点チェック: initial × 着席者数
  const expectedTotal = scoreVar.initial * seatedUserIds.length;
  // 供託金も含めた合計
  const potScore = currentState.__pot__?.score ?? 0;
  const playerTotal = seatedUserIds.reduce((sum, uid) => {
    const playerState = currentState[uid];
    if (!playerState) return sum;
    return sum + ((playerState.score as number) || 0);
  }, 0);
  const actualTotal = playerTotal + potScore;

  if (actualTotal !== expectedTotal) {
    return {
      canExecute: false,
      reason: `合計点が一致しません（期待: ${expectedTotal.toLocaleString()}, 実際: ${actualTotal.toLocaleString()}）`,
    };
  }

  // 同点チェック
  const scores = seatedUserIds.map((uid) => {
    const playerState = currentState[uid];
    return (playerState?.score as number) || 0;
  });
  const uniqueScores = new Set(scores);
  if (uniqueScores.size !== scores.length) {
    return { canExecute: false, reason: "同点のプレイヤーがいるため精算できません。先に順位を確定してください" };
  }

  return { canExecute: true };
}

/**
 * 精算を実行し Settlement オブジェクトを生成
 */
export function executeSettlement(
  currentState: GameState,
  seats: (SeatInfo | null)[],
  config: SettlementConfig,
  variables: Variable[]
): Settlement {
  const scoreVar = variables.find((v) => v.key === "score")!;
  const initialScore = scoreVar.initial;
  const divider = config.divider;

  // 着席中プレイヤー情報を収集
  const seatedPlayers = seats
    .filter((s): s is SeatInfo => s !== null && s.userId !== null)
    .map((s) => ({
      userId: s.userId!,
      displayName: s.displayName || s.userId!.substring(0, 8),
      score: ((currentState[s.userId!]?.score as number) || 0),
    }));

  // score降順でソート
  seatedPlayers.sort((a, b) => b.score - a.score);

  const playerCount = seatedPlayers.length as 3 | 4;
  const rankBonuses = config.rankBonuses[playerCount];

  // ランク付け＋順位点適用
  const playerResults: { [userId: string]: SettlementPlayerResult } = {};
  const resultsArray: { userId: string; result: SettlementPlayerResult }[] = [];

  for (let i = 0; i < seatedPlayers.length; i++) {
    const player = seatedPlayers[i];
    const rank = i + 1;
    const rankBonus = rankBonuses?.[i] ?? 0;
    const adjustedScore = player.score + rankBonus;

    // dividerで割り、小数点第一位まで切り捨て
    const divided = Math.floor((adjustedScore / divider) * 10) / 10;

    resultsArray.push({
      userId: player.userId,
      result: {
        displayName: player.displayName,
        finalScore: player.score,
        rank,
        rankBonus,
        adjustedScore,
        divided,
        result: divided, // 暫定値、最下位は後で端数調整
      },
    });
  }

  // 最下位のresult = -(上位合計) で端数調整
  const lastIndex = resultsArray.length - 1;
  const upperSum = resultsArray
    .slice(0, lastIndex)
    .reduce((sum, r) => sum + r.result.divided, 0);
  resultsArray[lastIndex].result.result = -upperSum;

  // playerResults マップに変換
  for (const { userId, result } of resultsArray) {
    playerResults[userId] = result;
  }

  return {
    id: generateUUID(),
    timestamp: Date.now(),
    type: "settlement",
    playerResults,
  };
}
