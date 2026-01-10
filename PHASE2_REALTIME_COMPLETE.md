# Phase 2: Realtime 購読とゲーム画面 - 実装完了

## 実装内容

### 1. Realtime フックの作成

[`app/hooks/useRoomRealtime.ts`](app/hooks/useRoomRealtime.ts) を実装しました。

#### 主な機能

- **初期データ取得**: ルーム ID に基づいて Supabase からルーム情報を取得
- **Realtime 購読**: Supabase Realtime を使用してルームの変更を監視
  - `UPDATE`イベント: ルーム情報の更新を検知
  - `DELETE`イベント: ルームの削除を検知
- **自動クリーンアップ**: コンポーネントのアンマウント時にチャンネルを削除
- **エラーハンドリング**: 適切なエラー状態管理

#### 技術的な詳細

```typescript
const channel = supabase
  .channel(`room-${roomId}`)
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "rooms",
      filter: `id=eq.${roomId}`,
    },
    (payload) => {
      setRoom(payload.new as Room);
    }
  )
  .subscribe();
```

### 2. ゲーム画面の実装

[`app/app/game/[id].tsx`](app/app/game/[id].tsx) を実装しました。

#### 主な機能

- **Dynamic Route**: `/game/[id]`でルーム ID を受け取る
- **リアルタイム同期**: useRoomRealtime フックを使用
- **プレイヤー一覧表示**:
  - 全プレイヤーの状態を表示
  - 各プレイヤーの変数値（スコア等）を表示
  - ホストには王冠マーク 👑 を表示
  - 自分には「あなた」と表示
- **ステータス表示**:
  - 募集中（waiting）: 青色バッジ
  - プレイ中（playing）: 緑色バッジ
  - 終了（finished）: グレーバッジ
- **ホストコントロール**:
  - ゲーム開始ボタン（waiting 時）
  - ゲーム終了ボタン（playing 時）
- **アクションボタン**: プレイ中にテンプレートのアクションを実行可能

#### UI 要素

- ヘッダー（戻るボタン、ルームコード、設定ボタン）
- ステータスバッジ
- プレイヤーカード（名前、変数値）
- アクションボタン（プレイ中のみ）
- ホストコントロール（ホストのみ）

### 3. 画面遷移の実装

ルーム作成・参加成功時にゲーム画面へ自動遷移するように修正しました。

#### 修正ファイル

- [`app/app/(tabs)/create-room.tsx`](<app/app/(tabs)/create-room.tsx:48>)
  - Alert 表示を削除し、直接ゲーム画面へ遷移
  - `router.push(\`/game/\${room.id}\`)`
- [`app/app/(tabs)/join-room.tsx`](<app/app/(tabs)/join-room.tsx:51>)
  - Alert 表示を削除し、直接ゲーム画面へ遷移
  - `router.push(\`/game/\${room.id}\`)`

## 動作確認手順

### 前提条件

1. Supabase プロジェクトが設定済み
2. アプリが起動している（`npm start`）
3. 匿名ログイン済み

### テスト手順

#### ステップ 1: ルーム作成とリアルタイム確認

1. **デバイス A（ホスト）**

   - 「部屋を作る」タブでルームを作成
   - 自動的にゲーム画面に遷移
   - ルームコードをメモ（例: `AB23`）
   - プレイヤー一覧に自分が表示されることを確認
   - 自分の名前に 👑 マークが表示されることを確認

2. **デバイス B（ゲスト）**

   - 「部屋に入る」タブでルームコードを入力
   - 自動的にゲーム画面に遷移
   - プレイヤー一覧に自分が表示されることを確認

3. **リアルタイム同期の確認**
   - デバイス A で、デバイス B のプレイヤーが**自動的に**表示されることを確認
   - 画面の再読み込みなしで即座に反映されるはず

#### ステップ 2: 複数プレイヤーでの同期確認

1. **デバイス C（ゲスト 2）**

   - 同じルームコードで参加
   - 全デバイスで 3 人のプレイヤーが表示されることを確認

2. **リアルタイム更新の確認**
   - 各デバイスで他のプレイヤーが即座に表示される
   - 「○ 人参加中」のカウントが自動更新される

#### ステップ 3: ステータス変更の確認

1. **ホスト（デバイス A）のみ**

   - 「ゲーム開始」ボタンが表示されることを確認
   - ボタンをタップ（TODO: 実装予定）

2. **全デバイス**
   - ステータスバッジが「募集中」→「プレイ中」に変わる（TODO: 実装予定）
   - アクションボタンが表示される（TODO: 実装予定）

#### ステップ 4: データベース確認

Supabase ダッシュボードで以下を確認：

1. **rooms テーブル**

   - `current_state`に全プレイヤーのデータが格納されている

   ```json
   {
     "user-id-1": {
       "score": 25000,
       "riichi": 0
     },
     "user-id-2": {
       "score": 25000,
       "riichi": 0
     }
   }
   ```

2. **Realtime 接続の確認**
   - ブラウザの開発者ツールで`Subscription status`ログを確認
   - `SUBSCRIBED`状態になっていることを確認

### トラブルシューティング

#### 問題: プレイヤーが自動的に表示されない

**原因**:

- Realtime 機能が有効になっていない
- ネットワーク接続の問題

**解決策**:

1. Supabase ダッシュボードで`Settings` → `API` → `Realtime`が有効か確認
2. ブラウザコンソールで接続エラーがないか確認
3. アプリを再起動

#### 問題: 「ルームが見つかりません」エラー

**原因**:

- ルーム ID が正しくない
- ルームが削除された

**解決策**:

- URL のルーム ID を確認
- 新しいルームを作成して再度テスト

#### 問題: 画面が真っ白

**原因**:

- Dynamic route の設定ミス
- コンポーネントのエラー

**解決策**:

- ターミナルのエラーログを確認
- `app/app/game/[id].tsx`ファイルが正しく配置されているか確認

## 実装されたファイル

### 新規作成

- [`app/hooks/useRoomRealtime.ts`](app/hooks/useRoomRealtime.ts) - Realtime 購読フック
- [`app/app/game/[id].tsx`](app/app/game/[id].tsx) - ゲーム画面

### 更新

- [`app/app/(tabs)/create-room.tsx`](<app/app/(tabs)/create-room.tsx>) - ゲーム画面への遷移追加
- [`app/app/(tabs)/join-room.tsx`](<app/app/(tabs)/join-room.tsx>) - ゲーム画面への遷移追加

## 技術的な詳細

### Supabase Realtime の仕組み

```typescript
// 1. チャンネルの作成
const channel = supabase.channel("room-123");

// 2. イベントリスナーの登録
channel.on(
  "postgres_changes",
  {
    event: "UPDATE",
    schema: "public",
    table: "rooms",
    filter: "id=eq.123",
  },
  (payload) => {
    // 変更を処理
  }
);

// 3. 購読開始
channel.subscribe();

// 4. クリーンアップ
supabase.removeChannel(channel);
```

### Dynamic Route の使い方

```typescript
// ファイル構造
app / app / game / [id].tsx; // Dynamic route

// パラメータの取得
const { id } = useLocalSearchParams<{ id: string }>();

// 遷移
router.push(`/game/${roomId}`);
```

### リアルタイム状態管理

```typescript
// useRoomRealtimeフックの使用
const { room, loading, error } = useRoomRealtime(roomId);

// roomが更新されると自動的に再レンダリング
useEffect(() => {
  console.log("Room updated:", room);
}, [room]);
```

## Phase 2 の完了状況

- ✅ ルーム作成機能の実装
- ✅ ルーム参加機能の実装
- ✅ Realtime 購読の実装
- ✅ ゲーム画面への遷移

## 次のステップ（Phase 3）

### 実装予定の機能

1. **ゲーム開始/終了機能**

   - ホストがステータスを変更できる機能
   - [`updateRoomStatus()`](app/lib/roomApi.ts:311) API の活用

2. **アクション実行機能**

   - プレイヤーがアクションを実行
   - スコアの計算と更新
   - 全プレイヤーへのリアルタイム反映

3. **Builder/Settings 画面（S-04）**

   - ホスト専用の設定画面
   - テンプレートの編集
   - 変数・アクションの追加/削除

4. **UX 改善**
   - ルームコードのコピー機能
   - QR コード表示
   - 退出確認ダイアログ
   - ローディング状態の改善

## まとめ

✅ Supabase Realtime を使用したリアルタイム同期が実装されました  
✅ ゲーム画面でプレイヤー一覧がリアルタイムに更新されます  
✅ ルーム作成・参加後に自動的にゲーム画面へ遷移します  
✅ ホストとゲストで異なる UI が表示されます  
✅ Phase 2 の全タスクが完了しました

次は、実際にゲームをプレイするための**アクション実行機能**とホスト専用の**設定画面**の実装に進みます！
