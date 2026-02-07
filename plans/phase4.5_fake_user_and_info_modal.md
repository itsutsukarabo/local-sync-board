# Phase 4.5: 架空ユーザーとカード情報モーダル

> **目的**: Phase 4.3（精算実行）の動作確認を1台の端末で行えるようにするための支援機能。
> 精算テストには複数プレイヤーが必要だが、架空ユーザーを作成することでホスト1人でテスト可能になる。
> カード情報モーダルは、今後の操作UI拡張の基盤にもなる。

---

## 4.5.1: 架空ユーザー（ゴーストプレイヤー）

### 概要

ホストが空席を **長押し** すると、架空のユーザーID・表示名でその座席に着席させる。
架空ユーザーは接続検知の対象外であり、ホストがドラッグ&ドロップで代理操作する。

### 設計

#### 型変更: `SeatInfo` に `isFake` フラグ追加

```typescript
// app/types/index.ts
export interface SeatInfo {
  userId: string | null;
  status: "active" | "inactive";
  displayName?: string;
  isFake?: boolean;  // 架空ユーザーフラグ（trueの場合、接続検知スキップ）
}
```

#### 架空ユーザーID生成規則

- 形式: `__fake_<seatIndex>__`（例: `__fake_0__`, `__fake_1__`）
- 予約キー `__` プレフィックスを使用するが、`__pot__`/`__history__`/`__settlements__` とは衝突しない
- **注意**: `GameState` のプレイヤー一覧フィルタ `!id.startsWith("__")` に引っかかるため、フィルタ条件を `__fake_` は除外しないよう変更が必要

→ **代替案（推奨）**: `fake_<seatIndex>` とし、`__` プレフィックスを使わない。
  - フィルタ変更が不要
  - 既存の予約キー規則と混同しない
  - 形式: `fake_0`, `fake_1`, `fake_2`, `fake_3`

#### 表示名の自動生成

座席インデックスに応じた名前を付与:
| seatIndex | 表示名 |
|-----------|--------|
| 0 | プレイヤーA |
| 1 | プレイヤーB |
| 2 | プレイヤーC |
| 3 | プレイヤーD |

### API: `joinFakeSeat`

```typescript
// app/lib/roomApi.ts に追加
export async function joinFakeSeat(
  roomId: string,
  seatIndex: number,
): Promise<{ error: Error | null }>
```

**処理フロー**:
1. 呼び出し元がホストであることを確認（`supabase.auth.getUser()` → `host_user_id` と比較）
2. 対象座席が空であることを確認
3. `fake_<seatIndex>` をuserIdとして `SeatInfo` を作成（`isFake: true`）
4. `current_state` に架空プレイヤーの初期値を追加（テンプレートの `variables` に基づく）
5. DBを一括更新（`seats` + `current_state`）

### UI変更

#### `EmptySeat` コンポーネント

**Props追加**:
```typescript
interface EmptySeatProps {
  position: SeatPosition;
  seatIndex: number;
  onJoinSeat: (seatIndex: number) => void;
  onLongPressJoinFake?: (seatIndex: number) => void;  // ホストのみ渡す
}
```

**動作**:
- 短押し（`onPress`）: 既存の自分が着席する動作（変更なし）
- 長押し（`onLongPress`）: `onLongPressJoinFake` が渡されている場合のみ、架空ユーザーを作成して着席

#### `MahjongTable` コンポーネント

**Props追加**:
```typescript
interface MahjongTableProps {
  // 既存...
  isHost: boolean;  // ← 新規追加（現状は hostUserId のみ）
  onJoinFakeSeat?: (seatIndex: number) => void;
}
```

**変更点**:
- `EmptySeat` に `onLongPressJoinFake` を渡す（ホストの場合のみ）
- 着席済みでも空席を表示するよう条件変更（ホストの場合のみ）
  - 現状: `isUserSeated` だと空席を非表示
  - 変更: `isUserSeated && !isHost` なら非表示、ホストなら空席も表示

#### `MahjongPlayerCard` のドラッグ有効化

現状 `isCurrentUser` の場合のみドラッグ可能だが、**ホストは架空ユーザーのカードもドラッグ可能**にする。

```typescript
// MahjongPlayerCard.tsx の gesture 定義
const gesture = Gesture.Pan()
  .enabled(isCurrentUser || (isHostUser && isFakePlayer))
  // ...
```

**Props追加**:
```typescript
interface MahjongPlayerCardProps {
  // 既存...
  isHostUser?: boolean;    // 現在のユーザーがホストか
  isFakePlayer?: boolean;  // このカードが架空ユーザーか
}
```

#### 接続検知のスキップ

`useConnectionMonitor` フック内で、`isFake: true` の座席はモニタリング対象から除外する。

```typescript
// useConnectionMonitor.ts 内
const targetUserIds = seats
  .filter((seat) => seat && seat.userId && !seat.isFake)
  .map((seat) => seat!.userId!);
```

### 対象ファイル

| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/types/index.ts` | 変更 | `SeatInfo` に `isFake?` 追加 |
| `app/lib/roomApi.ts` | 変更 | `joinFakeSeat` 関数追加 |
| `app/components/game/EmptySeat.tsx` | 変更 | `onLongPress` 対応 |
| `app/components/game/MahjongTable.tsx` | 変更 | ホスト時の空席表示 + `onJoinFakeSeat` 伝搬 |
| `app/components/game/MahjongPlayerCard.tsx` | 変更 | ホストによる架空ユーザーのドラッグ有効化 |
| `app/hooks/useConnectionMonitor.ts` | 変更 | 架空ユーザーのスキップ |
| `app/app/game/[id].tsx` | 変更 | `handleJoinFakeSeat` + MahjongTable Props追加 |

---

## 4.5.2: カード情報モーダル（プレイヤー詳細）

### 概要

麻雀モードでプレイヤーカードを **タップ** すると、そのプレイヤーの変数一覧と操作ボタンを表示するモーダルを開く。

**操作権限**:
- プレイヤー: なし（情報表示のみ）
- ホスト: 「離席させる」ボタンのみ

### UI設計

#### `PlayerInfoModal` コンポーネント（新規作成）

```typescript
// app/components/game/PlayerInfoModal.tsx
interface PlayerInfoModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  displayName: string;
  playerState: PlayerState;
  variables: Variable[];
  isFakePlayer: boolean;
  isHost: boolean;              // 現在のユーザーがホストか
  onForceLeave?: () => void;    // 離席させるハンドラー
}
```

**表示内容**:
- ヘッダー: プレイヤー名（displayName） + ✕閉じるボタン
- 変数一覧: 各変数のラベルと現在値をリスト表示
  ```
  点数: 25,000
  ```
- 操作ボタン（ホストのみ、末尾に配置）:
  - 「🚪 離席させる」ボタン（確認ダイアログ付き）
    - 架空ユーザー: `forceLeaveSeat` を実行し、`current_state` からも削除
    - 実ユーザー: `forceLeaveSeat` を実行

**UIパターン**: HistoryLog / SettlementHistory と同じModal展開パターン
- `animationType="slide"`, `transparent={true}`
- 下からスライドイン

### MahjongPlayerCard にタップ検出を追加

現在は `Gesture.Pan()` のみ。タップとパン（ドラッグ）を共存させる。

```typescript
// MahjongPlayerCard.tsx
const tapGesture = Gesture.Tap()
  .onEnd(() => {
    runOnJS(onTap)(playerId);
  });

const panGesture = Gesture.Pan()
  .enabled(isCurrentUser || (isHostUser && isFakePlayer))
  // ...既存のハンドラー...

const composedGesture = Gesture.Race(tapGesture, panGesture);
// → ドラッグが始まればPan優先、動かなければTap
```

**注意**: `Gesture.Exclusive(panGesture, tapGesture)` だとPanが常に優先されるため、`Gesture.Race()` を使用。ただし `Race` ではドラッグ開始時もタップが発火する場合があるため、`Gesture.Exclusive()` でPan優先にし、`activateAfterLongPress` や `minDistance` でタップの判定を明示するアプローチも検討。

**推奨**: `Gesture.Exclusive(panGesture, tapGesture)` + `panGesture` に `minDistance(10)` を設定。
  - 10px以上動いたらパン（ドラッグ）
  - 動かなければタップ
  - `Exclusive` はリスト先頭を優先するが、Pan が `minDistance` を超えるまでは判定保留

**Props追加**:
```typescript
interface MahjongPlayerCardProps {
  // 既存...
  onTap?: (playerId: string) => void;
}
```

### MahjongTable での統合

```typescript
// MahjongTable.tsx
const [playerInfoModal, setPlayerInfoModal] = useState<{
  visible: boolean;
  playerId: string;
} | null>(null);
```

- `MahjongPlayerCard` に `onTap` を渡す
- タップ時に `playerInfoModal` を開く
- `PlayerInfoModal` に必要なデータを渡す
- `onForceLeave` で `forceLeaveSeat`（+ 架空ユーザーなら `current_state` からも削除）を実行

### 架空ユーザーの離席処理

通常の `forceLeaveSeat` は座席からの離席のみ行うが、架空ユーザーの場合は `current_state` からもエントリを削除する必要がある。

```typescript
// app/lib/roomApi.ts に追加
export async function removeFakePlayer(
  roomId: string,
  fakeUserId: string,
): Promise<{ error: Error | null }>
```

**処理フロー**:
1. 座席から `fakeUserId` を除去（`null` に戻す）
2. `current_state` から `fakeUserId` のエントリを削除
3. 一括DB更新

### 対象ファイル

| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/components/game/PlayerInfoModal.tsx` | 新規作成 | プレイヤー情報モーダル |
| `app/components/game/MahjongPlayerCard.tsx` | 変更 | タップジェスチャー追加 |
| `app/components/game/MahjongTable.tsx` | 変更 | `playerInfoModal` state + `PlayerInfoModal` 配置 |
| `app/lib/roomApi.ts` | 変更 | `removeFakePlayer` 追加 |
| `app/app/game/[id].tsx` | 変更 | ハンドラー追加（必要に応じて） |

---

## 実装順序

1. **4.5.1** 架空ユーザー → 1台で複数プレイヤーをシミュレート可能に
2. **4.5.2** カード情報モーダル → ホストによる離席操作のUIを提供

4.5.2 は 4.5.1 に依存（架空ユーザーの離席処理が含まれるため）。

## 検証

- `cd app && npx tsc --noEmit` でコンパイル確認
- ホストが空席長押し → 架空ユーザーが着席すること
- ホストが架空ユーザーのカードをドラッグ → 支払い/供託が動作すること
- 架空ユーザー含む3〜4人で精算を実行 → 精算結果が正しいこと
- カードタップで情報モーダルが開くこと
- ホストが「離席させる」→ 架空ユーザーが離席・削除されること
- 接続切れ表示が架空ユーザーに表示されないこと
