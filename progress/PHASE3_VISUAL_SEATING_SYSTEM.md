# Phase 3: ビジュアル着席システムの実装完了

## 実装日

2026-01-12

## 概要

自動座席配置ロジックを廃止し、ユーザーが空いている席をタップして座る「選択式着席システム」を実装しました。

## 実装内容

### 1. UX の変更

- **変更前:** ルームに入ると自動的に空いている順に割り当てられ、画面下（自分）に固定される
- **変更後:**
  - ルーム入室直後は「観戦モード（席なし）」となる
  - 画面上の空席（Top/Left/Right/Bottom）に「着席する」ボタン（＋アイコン）を表示
  - ボタンをタップすると、その位置に自分のユーザー情報が紐づく
  - 座席に座った後は「離席」ボタンで座席から離れることができる

### 2. データモデルの変更

#### 型定義の追加 ([`app/types/index.ts`](app/types/index.ts))

```typescript
// 座席情報
export interface SeatInfo {
  userId: string | null;
  status: "active" | "inactive";
}

// Room型に座席配列を追加
export interface Room {
  // ... 既存のフィールド
  seats: (SeatInfo | null)[]; // 座席配列 [Bottom, Right, Top, Left]
}
```

#### データベースマイグレーション ([`supabase/migrations/004_add_seats_to_rooms.sql`](supabase/migrations/004_add_seats_to_rooms.sql))

```sql
-- 座席情報を rooms テーブルに追加
ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS seats JSONB DEFAULT '[]'::jsonb;

-- 既存のルームに空の座席配列を設定
UPDATE rooms
SET seats = '[]'::jsonb
WHERE seats IS NULL OR seats = 'null'::jsonb;
```

### 3. API 関数の実装

#### [`app/lib/roomApi.ts`](app/lib/roomApi.ts)

- **`joinSeat(roomId, seatIndex)`**: 指定した座席に着席
  - 座席インデックス: 0=Bottom, 1=Right, 2=Top, 3=Left
  - 空席チェック、重複チェックを実施
  - プレイヤーの初期状態を自動設定
- **`leaveSeat(roomId)`**: 現在の座席から離席
  - 座席を null に設定
- **`createRoom()`**: 座席配列を初期化 `[null, null, null, null]`

- **`joinRoom()`**: 観戦モードで入室（自動座席割り当てを廃止）

### 4. UI コンポーネント

#### [`app/components/game/EmptySeat.tsx`](app/components/game/EmptySeat.tsx)

- 空席を表示する新しいコンポーネント
- 「＋」アイコンと「着席する」ラベルを表示
- タップで座席に着席

#### [`app/components/game/MahjongTable.tsx`](app/components/game/MahjongTable.tsx)

- 座席配列ベースの表示に変更
- 空席の場合は `EmptySeat` コンポーネントを表示
- プレイヤーが座っている場合は `MahjongPlayerCard` を表示
- 視点回転機能を維持（自分が常に Bottom に表示される）

### 5. 座席ユーティリティの更新

#### [`app/utils/seatUtils.ts`](app/utils/seatUtils.ts)

新しい関数を追加:

- **`getSeatPositionFromIndex(seatIndex)`**: インデックスから座席位置を取得
- **`getSeatIndexFromPosition(position)`**: 座席位置からインデックスを取得
- **`createSeatMapFromSeats(seats, currentUserId)`**: 座席配列から座席マップを生成（視点回転あり）

既存の `assignSeats()` は後方互換性のため残しています。

### 6. ゲーム画面の更新

#### [`app/app/game/[id].tsx`](app/app/game/[id].tsx)

- `handleJoinSeat(seatIndex)`: 座席着席ハンドラーを追加
- `handleLeaveSeat()`: 座席離席ハンドラーを追加
- `isUserSeated`: ユーザーが座席に座っているかチェック
- 麻雀モードで「離席」ボタンを表示（座席に座っている場合のみ）
- `MahjongTable` に `seats` と `onJoinSeat` プロパティを渡す

## 座席インデックスの定義

```
座席配列: [Bottom, Right, Top, Left]
インデックス: [0, 1, 2, 3]

視覚的な配置:
        Top (2)
         ↑
Left (3) ← → Right (1)
         ↓
      Bottom (0)
```

## 視点回転ロジック

現在のユーザーが常に画面下（Bottom）に表示されるように、座席配列を回転させて表示します。

例: ユーザーがインデックス 2（Top）に座っている場合

- 回転量 = 2
- 表示位置 = (実際のインデックス - 回転量 + 4) % 4

## 使用方法

### 1. ルームに入室

```typescript
const { room, error } = await joinRoom(roomCode);
// 観戦モードで入室（座席には座らない）
```

### 2. 座席に着席

```typescript
const { room, error } = await joinSeat(roomId, seatIndex);
// seatIndex: 0=Bottom, 1=Right, 2=Top, 3=Left
```

### 3. 座席から離席

```typescript
const { room, error } = await leaveSeat(roomId);
```

## テスト項目

- [x] ルーム作成時に座席配列が初期化される
- [x] ルーム入室時に観戦モードになる
- [x] 空席に「着席する」ボタンが表示される
- [x] ボタンをタップして座席に着席できる
- [x] 既に座席に座っている場合は空席ボタンが表示されない
- [x] 座席に座った後、自分が常に画面下に表示される
- [x] 「離席」ボタンで座席から離れることができる
- [x] 他のプレイヤーの座席変更がリアルタイムで反映される

## 既知の制限事項

1. **座席の移動**: 現在、一度座った座席から別の座席への直接移動はできません。一度離席してから再度着席する必要があります。

2. **座席の予約**: 座席の予約機能はありません。先着順で座席が埋まります。

3. **最大人数**: 現在は 4 人固定です。3 人麻雀などの対応は今後の課題です。

## 今後の改善案

1. **座席の移動機能**: 離席せずに別の座席に移動できる機能
2. **座席のロック**: ホストが特定の座席をロックする機能
3. **座席の指定**: ホストが特定のプレイヤーを特定の座席に割り当てる機能
4. **人数設定**: 2 人、3 人、4 人など、ゲームの人数に応じた座席数の調整

## 関連ファイル

### 新規作成

- [`supabase/migrations/004_add_seats_to_rooms.sql`](supabase/migrations/004_add_seats_to_rooms.sql)
- [`app/components/game/EmptySeat.tsx`](app/components/game/EmptySeat.tsx)
- [`progress/PHASE3_VISUAL_SEATING_SYSTEM.md`](progress/PHASE3_VISUAL_SEATING_SYSTEM.md)

### 更新

- [`app/types/index.ts`](app/types/index.ts) - SeatInfo 型と Room 型の更新
- [`app/lib/roomApi.ts`](app/lib/roomApi.ts) - joinSeat, leaveSeat 関数の追加、joinRoom/createRoom の更新
- [`app/utils/seatUtils.ts`](app/utils/seatUtils.ts) - 座席インデックスベースの関数追加
- [`app/components/game/MahjongTable.tsx`](app/components/game/MahjongTable.tsx) - 座席配列ベースの表示に変更
- [`app/app/game/[id].tsx`](app/app/game/[id].tsx) - 座席着席/離席ハンドラーの追加

## まとめ

ビジュアル着席システムの実装により、ユーザーは自分の好きな位置に座ることができるようになりました。これにより、「上家・下家」の関係をユーザー自身が物理的な位置関係で決定できるようになり、より直感的なゲーム体験を提供できます。

自動座席割り当てから選択式着席システムへの移行は、Phase 3 の重要なマイルストーンです。
