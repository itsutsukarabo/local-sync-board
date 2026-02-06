# Task 3.6-7: 定期接続確認 & 10分タイムアウト強制離席

## 方式
**Supabase Presence API** を使用。DBへの定期書き込みは行わない。

## 仕様まとめ
- **ハートビート**: `channel.track()` を30秒おきに呼び出し
- **切断判定**: Presence `leave` イベント後、60秒（2回分）の猶予期間を設け、復帰しなければ「切断中」と判定
- **切断表示**: プレイヤーカードに「切断中 X分Y秒」を赤テキストで表示（グレーアウトはしない）。表示更新は30秒おき（ハートビート周期と同じ）
- **強制離席**: 切断から10分経過後、検知したクライアントが `forceLeaveSeat()` を実行（冪等）
- **復帰判定**: アプリ復帰時（3.6-6のAppState連携）に `track()` 再呼び出しで接続状態に復帰

## ファイル変更一覧

### 新規作成
| ファイル | 役割 |
|---------|------|
| `app/hooks/useConnectionMonitor.ts` | Presence管理・切断検知・タイムアウト処理の中核フック |

### 変更
| ファイル | 変更内容 |
|---------|---------|
| `app/types/index.ts` | `ConnectionStatus` 型を追加 |
| `app/lib/roomApi.ts` | `forceLeaveSeat()` 関数を追加 |
| `app/app/game/[id].tsx` | `useConnectionMonitor` フックを統合、`connectionStatuses` を MahjongTable に渡す |
| `app/components/game/MahjongTable.tsx` | `connectionStatuses` prop追加、MahjongPlayerCard に `disconnectedAt` を渡す |
| `app/components/game/MahjongPlayerCard.tsx` | `disconnectedAt` prop追加、切断中テキスト表示 |

---

## Step 1: `app/types/index.ts` — ConnectionStatus 型追加

```typescript
/** プレイヤー接続状態（クライアントサイド管理、DBには保存しない） */
export interface ConnectionStatus {
  userId: string;
  isConnected: boolean;
  disconnectedAt: number | null; // Date.now() のタイムスタンプ
}
```

## Step 2: `app/lib/roomApi.ts` — forceLeaveSeat 追加

指定ユーザーを座席から強制離席する関数。冪等性あり（既に離席済みならno-op）。

```typescript
export async function forceLeaveSeat(
  roomId: string,
  targetUserId: string
): Promise<{ error: Error | null }> {
  // 1. 最新のrooms.seatsを取得
  // 2. targetUserIdの座席を探す → 見つからなければ { error: null } で正常終了
  // 3. seats[index] = null に設定しDB更新
}
```

既存の `leaveSeat()` は認証ユーザー自身用。`forceLeaveSeat()` は他プレイヤーのタイムアウト離席用。

## Step 3: `app/hooks/useConnectionMonitor.ts` — 新規作成

### インターフェース
```typescript
interface UseConnectionMonitorResult {
  connectionStatuses: Map<string, ConnectionStatus>;
}

export function useConnectionMonitor(
  roomId: string | null,
  userId: string | null,
  seats: (SeatInfo | null)[],
): UseConnectionMonitorResult
```

### 内部ロジック

**Presenceチャンネル**
- チャンネル名: `presence-room-${roomId}`（全クライアント共通名、Presenceの共有に必要）
- subscribe後に `channel.track({ user_id: userId, online_at: ... })` で自身を登録

**30秒ハートビート**
- `setInterval` で30秒おきに `channel.track()` を再呼び出し
- 同じインターバルで `connectionStatuses` のステートを更新（切断中テキストの経過時間が更新される）

**イベントハンドラ**
- `presence.join`: 該当ユーザーを `isConnected: true` にし、猶予タイマー・強制離席タイマーをクリア
- `presence.leave`: 60秒猶予タイマーを開始
- `presence.sync`: 初回同期時に、着席中だがPresenceに不在のユーザーを検出して猶予タイマーを開始

**60秒猶予タイマー（graceTimers）**
- `leave`後60秒経過してもPresenceに復帰しない → `isConnected: false, disconnectedAt: Date.now()` に設定
- 10分強制離席タイマーを開始

**10分強制離席タイマー（forceLeaveTimers）**
- `disconnectedAt` から10分経過 → `forceLeaveSeat(roomId, targetUserId)` を実行
- 複数クライアントが同時に呼んでも冪等なので安全

**表示更新（1秒ティックは使わない）**
- 30秒おきのハートビートインターバル内で `setConnectionStatuses` を呼んで再レンダーをトリガー
- 「切断中 X分Y秒」の表示は30秒おきに更新される（リアルタイムカウンターではない）

**AppState連携（3.6-6統合）**
- AppState が `active` に変わったら `channel.track()` を再呼び出し
- これにより他クライアント側で `join` イベントが発火し、切断判定が解除される

**seats変更への追従**
- `seatsRef` で最新のseatsを保持
- 座席から外れたユーザーのタイマーをクリア、connectionStatusesから削除

**クリーンアップ（unmount時）**
- 全タイマーをクリア（graceTimers, forceLeaveTimers, heartbeat）
- `channel.untrack()` → `supabase.removeChannel(channel)`

## Step 4: `app/app/game/[id].tsx` — フック統合

```typescript
import { useConnectionMonitor } from "../../hooks/useConnectionMonitor";

// useRoomRealtime の直後:
const { connectionStatuses } = useConnectionMonitor(
  id ?? null,
  user?.id ?? null,
  room?.seats ?? [null, null, null, null],
);

// MahjongTable に渡す:
<MahjongTable
  ...既存props
  connectionStatuses={connectionStatuses}
/>
```

## Step 5: `app/components/game/MahjongTable.tsx` — props中継

```typescript
interface MahjongTableProps {
  ...既存props
  connectionStatuses?: Map<string, ConnectionStatus>;
}

// MahjongPlayerCard に disconnectedAt を渡す:
<MahjongPlayerCard
  ...既存props
  disconnectedAt={connectionStatuses?.get(playerId)?.disconnectedAt ?? null}
/>
```

## Step 6: `app/components/game/MahjongPlayerCard.tsx` — 切断表示

```typescript
interface MahjongPlayerCardProps {
  ...既存props
  disconnectedAt?: number | null;
}
```

ヘッダー行の下に切断テキストを表示:
```tsx
{disconnectedAt != null && (
  <Text style={styles.disconnectText}>
    {formatDisconnectDuration(disconnectedAt)}
  </Text>
)}
```

ヘルパー関数:
```typescript
function formatDisconnectDuration(disconnectedAt: number): string {
  const elapsed = Math.floor((Date.now() - disconnectedAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  if (minutes > 0) return `切断中 ${minutes}分${seconds.toString().padStart(2, '0')}秒`;
  return `切断中 ${seconds}秒`;
}
```

スタイル: `fontSize: 10, color: '#ef4444'`（赤テキスト、グレーアウトなし）

---

## エッジケース対応

| ケース | 対応 |
|--------|------|
| 複数クライアントが同時に10分タイムアウト検知 | `forceLeaveSeat` が冪等なので安全 |
| 途中参加クライアント（切断から5分後に入室） | `sync` イベントで不在を検知 → 猶予60s → 新規10分タイマー開始。先にいたクライアントのタイマーが先に発火 |
| 猶予期間中に復帰 | `join` イベントで猶予タイマーをクリア、切断判定にならない |
| 切断判定後・10分前に復帰 | `join` イベントで強制離席タイマーをクリア、接続済みに戻る |
| 自分自身の切断 | アプリ復帰時に `track()` で復帰。バックグラウンド中は自分で自分を監視不要 |
| 画面離脱時 | unmountでPresence untrack → 他クライアントが検知 |

## 検証方法
1. 2台のデバイスで同じルームに入室・着席
2. 片方の端末でアプリをキル（またはネットワーク切断）
3. もう片方で約60秒後に「切断中 X秒」が表示されることを確認
4. 10分後（テスト時は短縮可）に自動離席されることを確認
5. 切断端末を復帰させ、60秒以内なら切断表示が出ないことを確認
6. TypeScriptチェック: `cd app && npx tsc --noEmit`
