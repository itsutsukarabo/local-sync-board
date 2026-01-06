# Phase 2: ルーム作成機能 - 実装完了

## 📋 実装内容

Phase 2 のルーム作成機能を実装しました。

### 実装したファイル

1. **[`supabase/migrations/002_create_rooms_table.sql`](supabase/migrations/002_create_rooms_table.sql)**

   - rooms テーブルの作成
   - RLS（Row Level Security）ポリシーの設定
   - Realtime の有効化
   - ルームコード生成関数

2. **[`app/utils/roomUtils.ts`](app/utils/roomUtils.ts)**

   - ルームコード生成関数（4 文字の英数字）
   - ルームコードバリデーション
   - ゲームテンプレートのプリセット（麻雀、シンプルスコア）

3. **[`app/lib/roomApi.ts`](app/lib/roomApi.ts)**

   - ルーム作成 API
   - ルーム検索 API
   - ルーム参加 API
   - ルーム退出 API
   - ルーム削除 API

4. **[`app/app/(tabs)/create-room.tsx`](<app/app/(tabs)/create-room.tsx>)**
   - ルーム作成画面 UI
   - テンプレート選択機能
   - ルーム作成処理

## 🔧 動作確認手順

### 1. Supabase のセットアップ

まず、Supabase に rooms テーブルを作成します。

#### 方法 A: Supabase Dashboard（推奨）

1. [Supabase Dashboard](https://app.supabase.com)にアクセス
2. プロジェクトを選択
3. 左メニューから「SQL Editor」を選択
4. 「New query」をクリック
5. [`supabase/migrations/002_create_rooms_table.sql`](supabase/migrations/002_create_rooms_table.sql)の内容をコピー＆ペースト
6. 「Run」をクリックして実行

#### 方法 B: Supabase CLI（ローカル開発の場合）

```bash
# Supabaseプロジェクトにリンク（初回のみ）
npx supabase link --project-ref YOUR_PROJECT_REF

# マイグレーションを実行
npx supabase db push
```

### 2. テーブルの確認

Supabase Dashboard で以下を確認：

1. 左メニューから「Table Editor」を選択
2. `rooms`テーブルが作成されていることを確認
3. カラム構成を確認：
   - `id` (uuid)
   - `room_code` (text)
   - `host_user_id` (uuid)
   - `status` (text)
   - `template` (jsonb)
   - `current_state` (jsonb)
   - `created_at` (timestamp)

### 3. RLS ポリシーの確認

1. `rooms`テーブルを選択
2. 右上の「...」メニューから「View policies」を選択
3. 以下のポリシーが設定されていることを確認：
   - Anyone can view rooms with room_code
   - Authenticated users can create rooms
   - Host can update their own rooms
   - Host can delete their own rooms

### 4. アプリの起動

```bash
cd app
npm start
```

または

```bash
cd app
npx expo start
```

### 5. 動作確認

#### ステップ 1: 認証確認

1. アプリを起動
2. Welcome 画面でニックネームを入力（Phase 1 で実装済み）
3. ホーム画面に遷移することを確認

#### ステップ 2: ルーム作成画面の表示

1. ホーム画面で「部屋を作る」タブをタップ
2. ルーム作成画面が表示されることを確認
3. 以下の要素が表示されていることを確認：
   - タイトル「ルームを作成」
   - テンプレート選択カード（麻雀、シンプルスコア）
   - 「ルームを作成」ボタン
   - 説明テキスト

#### ステップ 3: テンプレート選択

1. 「麻雀」テンプレートをタップ
2. カードが選択状態（青い枠線）になることを確認
3. 変数とアクションの詳細が表示されることを確認：

   - 変数: 点数、リーチ棒
   - アクション: リーチ、ロン、ツモなど

4. 「シンプルスコア」テンプレートをタップ
5. カードが選択状態になることを確認
6. 変数とアクションの詳細が表示されることを確認：
   - 変数: スコア
   - アクション: +1, +5, +10, -1, -5, -10

#### ステップ 4: ルーム作成

1. テンプレートを選択（例: 麻雀）
2. 「ルームを作成」ボタンをタップ
3. ローディングインジケーターが表示されることを確認
4. 成功ダイアログが表示されることを確認：
   - タイトル: 「ルーム作成成功」
   - メッセージ: ルームコード（4 文字の英数字）が表示される
   - 例: `ルームコード: A3K7`

#### ステップ 5: Supabase でデータ確認

1. Supabase Dashboard の「Table Editor」を開く
2. `rooms`テーブルを選択
3. 新しいレコードが作成されていることを確認：

   - `room_code`: 4 文字の英数字（例: A3K7）
   - `host_user_id`: 現在のユーザー ID
   - `status`: "waiting"
   - `template`: 選択したテンプレートの JSON
   - `current_state`: 空のオブジェクト `{}`

4. `profiles`テーブルを確認
5. 自分のプロファイルの`current_room_id`が更新されていることを確認

### 6. エラーケースの確認

#### ケース 1: 認証なしでルーム作成

1. アプリを完全に終了
2. Supabase Dashboard で該当ユーザーのセッションを削除
3. アプリを再起動
4. ルーム作成を試みる
5. エラーメッセージが表示されることを確認

#### ケース 2: ネットワークエラー

1. デバイスの機内モードを ON
2. ルーム作成を試みる
3. 適切なエラーメッセージが表示されることを確認

## 📊 実装した機能

### ✅ 完了した機能

- [x] rooms テーブルの作成
- [x] RLS ポリシーの設定
- [x] Realtime の有効化
- [x] ルームコード生成（4 文字英数字、紛らわしい文字を除外）
- [x] ルームコードバリデーション
- [x] ゲームテンプレートのプリセット
- [x] ルーム作成 API
- [x] ルーム作成画面 UI
- [x] テンプレート選択機能
- [x] ローディング状態の表示
- [x] エラーハンドリング

### 🔄 次のステップ（Phase 2 の残りのタスク）

- [ ] ルーム参加機能の実装
- [ ] ルーム参加画面 UI の実装
- [ ] Realtime 購読の実装
- [ ] ゲーム画面への遷移

## 🎨 UI/UX の特徴

### デザイン

- **カラースキーム**: 青を基調とした清潔感のあるデザイン
- **選択状態**: 青い枠線とラジオボタンで明確に表示
- **情報表示**: テンプレートの詳細を折りたたまずに表示
- **フィードバック**: ローディング中はボタンが無効化され、インジケーターを表示

### ユーザビリティ

- **直感的な操作**: タップでテンプレートを選択
- **明確なフィードバック**: 成功時にルームコードを表示
- **エラーハンドリング**: 失敗時に分かりやすいエラーメッセージ
- **情報提供**: 画面下部に使い方のヒントを表示

## 🔐 セキュリティ

### RLS（Row Level Security）

- **SELECT**: 誰でもルームコードを知っていれば参照可能
- **INSERT**: 認証済みユーザーのみルーム作成可能
- **UPDATE**: ホストユーザーのみ自分のルームを更新可能
- **DELETE**: ホストユーザーのみ自分のルームを削除可能

### データ検証

- **クライアント側**: ルームコードのフォーマット検証
- **サーバー側**: Supabase のチェック制約でステータスを検証

## 🐛 既知の問題と今後の改善点

### 現在の制限

1. **ゲーム画面未実装**: ルーム作成後、ゲーム画面に遷移できない
2. **ルーム一覧未実装**: 作成したルームの一覧表示機能がない
3. **カスタムテンプレート未実装**: プリセット以外のテンプレートを作成できない

### 今後の改善案

1. **QR コード共有**: ルームコードを QR コードで表示
2. **クリップボードコピー**: ルームコードをワンタップでコピー
3. **テンプレートプレビュー**: より詳細なテンプレート情報の表示
4. **ルーム設定**: プレイヤー数制限、パスワード保護など

## 📝 コード例

### ルーム作成の基本的な使い方

```typescript
import { createRoom } from "../../lib/roomApi";
import { DEFAULT_MAHJONG_TEMPLATE } from "../../utils/roomUtils";

// ルームを作成
const { room, error } = await createRoom(DEFAULT_MAHJONG_TEMPLATE);

if (error) {
  console.error("Error:", error.message);
} else {
  console.log("Room created:", room.room_code);
}
```

### カスタムテンプレートの作成

```typescript
import { GameTemplate } from "../../types";

const customTemplate: GameTemplate = {
  variables: [
    { key: "hp", label: "HP", initial: 100 },
    { key: "mp", label: "MP", initial: 50 },
  ],
  actions: [
    { label: "攻撃", calc: "hp - 10" },
    { label: "回復", calc: "hp + 20" },
    { label: "魔法", calc: "mp - 5" },
  ],
};

const { room, error } = await createRoom(customTemplate);
```

## 🎯 次のフェーズ

Phase 2 の残りのタスク：

1. **ルーム参加機能**: ルームコード入力でルームに参加
2. **Realtime 購読**: ルーム状態の変更をリアルタイムで受信
3. **ゲーム画面**: プレイヤー一覧とスコア表示

Phase 3 に進む前に、これらの機能を完成させる必要があります。

## 📚 参考資料

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [React Native Best Practices](https://reactnative.dev/docs/performance)
