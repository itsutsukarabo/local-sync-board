# 初回着席バグ修正 + ゲーム画面ロジックのフック抽出・テスト追加

## Context

### バグ: 初回着席時に画面が更新されない

**根本原因**: `useRoomRealtime.ts` の SUBSCRIBED refetch と Realtime UPDATE の**レースコンディション**。

タイムライン:
1. `mainEffect` → `fetchInitialData()` + `setupRealtimeSubscriptionFn()` 実行
2. `fetchInitialData` 完了 → `setRoom(data)`, `setLoading(false)` → UI描画
3. Channel が SUBSCRIBED → `refetchRef.current()` 発火（300ms debounce + HTTP RTT）
4. Refetch 完了 → `setRoom(data)`, **`lastManualRefetchTime = Date.now()` (T₁)**
5. ユーザーが着席タップ → `joinSeat()` → DB更新 → Realtime UPDATE イベント発火
6. UPDATE ハンドラ: `elapsed = now - T₁` → **500ms 以内なら SKIPPED！**

診断ログ (`dlog`, `setRoomD` 等, 計36箇所) の `console.log` オーバーヘッドがタイミングをずらし、
レース窓口を事実上ゼロにしていた。ログ削除で露出。

**修正方針**: 初回 SUBSCRIBED では refetch をスキップする（`fetchInitialData` が既にデータ取得済み）。
再接続時の SUBSCRIBED のみ refetch する。

### リファクタリング: ゲーム画面のフック抽出

**対象**: `app/app/game/[id].tsx`（898行, useState×2, useEffect×3, useCallback×1, イベントハンドラ×10）

**抽出候補**: ゲーム操作ハンドラ + 関連状態 → `useGameActions` フック

---

## 修正対象ファイル

| ファイル | 変更内容 |
|---|---|
| `app/hooks/useRoomRealtime.ts` | 初回 SUBSCRIBED の refetch スキップ |
| `app/app/game/[id].tsx` | ロジックを `useGameActions` に委譲 |
| `app/hooks/useGameActions.ts` | **新規** - ゲーム操作ハンドラの抽出先 |
| `vitest.config.ts` | hook テスト用の jsdom 環境設定追加 |
| `tests/hooks/useRoomRealtime.test.ts` | **新規** - Realtime フックのテスト |
| `tests/hooks/useGameActions.test.ts` | **新規** - ゲーム操作フックのテスト |
| `package.json` | テストライブラリ追加 |

---

## Step 1: 環境セットアップ

```bash
npm install -D @testing-library/react react-dom jsdom
```

hookテストは各ファイル先頭で `// @vitest-environment jsdom` を指定し、
ファイル単位で jsdom 環境に切り替える（既存の Supabase 統合テストに影響しない）。

## Step 2: バグ修正 — `useRoomRealtime.ts`

`setupRealtimeSubscriptionFn` 内の SUBSCRIBED ハンドラを修正:

```typescript
// 新規追加: 初回接続かどうかを追跡する ref
const isInitialSubscribeRef = useRef(true);

// SUBSCRIBED ハンドラ内:
if (status === "SUBSCRIBED") {
  markReconnected();
  resubscribeAttemptsRef.current = 0;
  // 初回接続では fetchInitialData が既にデータを取得済みなので refetch 不要。
  // 再接続時のみ refetch して最新データに同期する。
  if (isInitialSubscribeRef.current) {
    isInitialSubscribeRef.current = false;
  } else {
    refetchRef.current();
  }
}
```

`rebuildChannel` 内で `isInitialSubscribeRef` をリセットしない（再構築は再接続扱い）。

## Step 3: `useGameActions` フック抽出

`game/[id].tsx` から以下を抽出:

```typescript
// app/hooks/useGameActions.ts
interface UseGameActionsParams {
  room: Room | null;
  user: User | null;
  isHost: boolean;
  showToast: (type: string, msg: string) => void;
  refetch: () => Promise<void>;
}

interface UseGameActionsResult {
  isProcessing: boolean;
  settlementCount: number;
  handleJoinSeat: (seatIndex: number) => Promise<void>;
  handleJoinFakeSeat: (seatIndex: number) => Promise<void>;
  handleLeaveSeat: () => Promise<void>;
  handleForceLeave: (targetUserId: string) => Promise<void>;
  handleTransfer: (from: string, to: string, transfers: ...) => Promise<void>;
  handleRollback: (historyId: string) => Promise<void>;
  handleUndo: () => Promise<void>;
  handleSettlement: () => void;
  handleJoinGame: () => Promise<void>;
  handleLeaveGame: () => Promise<void>;
  handleSettlementComplete: () => Promise<void>;
}
```

元の `game/[id].tsx` はこのフックを呼び出す薄いコンポーネントに変わる。

## Step 4: ゲーム画面への適用

`game/[id].tsx` を修正し、`useGameActions` フックを利用するように書き換え。

## Step 5: テストの作成と実行

### `useRoomRealtime` テスト — Supabase をモックして以下をテスト:
1. **stableRoomId 安定化**: `roomId` が undefined に戻っても `stableRoomId` が維持される
2. **初期取得**: `fetchInitialData` → `room` にデータ、`loading=false`
3. **タイムアウト安全策**: 5秒間 roomId が undefined → `error` がセットされる
4. **初回 SUBSCRIBED で refetch しない**: cooldown が設定されないことを確認
5. **再接続 SUBSCRIBED で refetch する**: 2回目の SUBSCRIBED で refetch が呼ばれる

### `useGameActions` テスト — roomApi をモックして以下をテスト:
1. **isProcessing 排他制御**: transfer 中に二重送信されない
2. **handleTransfer**: 成功時 → toast("success"), 失敗時 → toast("error")
3. **handleSettlement**: `canExecuteSettlement` が false → Alert 表示、true → 精算実行
4. **settlementCount 更新**: room 変更時に `fetchSettlements` が呼ばれカウント更新

## 検証手順

1. `npm install` で新しい依存を導入
2. `npm test` で全テスト（既存 + 新規 hook テスト）が green であること
3. アプリを起動し、以下のシナリオを手動確認:
   - ルーム作成 → 着席（初回） → **即座に画面反映されること**
   - 着席後にスコア移動 → Realtime で反映されること
   - アプリをバックグラウンド→復帰 → データ最新化されること
