# Phase 3: ゲーム画面レイアウト作成 + 参加/退出機能 - 完了 ✅

## 実装日時

2026-01-10

## 実装内容

### 1. ゲーム画面のコンポーネント構造設計 ✅

Phase 3 のタスク「1. ゲーム画面のレイアウト作成」を完了しました。

### 2. 追加機能: 全ユーザーの参加/退出機能 ✅

ユーザーフィードバックに基づき、ホストがゲームに自動参加せず、明示的に参加/退出を選択できる機能を追加しました。

**重要**: この機能は**全ユーザー**（ホストおよび一般プレイヤー）が利用できます。

- ホストはルーム作成時に自動参加せず、参加ボタンで明示的に参加
- 一般プレイヤーもルーム入室時に自動参加するが、退出ボタンで退出可能
- 全ユーザーがゲーム途中での参加/退出が可能

## 作成・更新したファイル

### コンポーネント（新規作成）

1. [`app/components/game/PlayerCard.tsx`](app/components/game/PlayerCard.tsx) - 個別プレイヤー情報カード
2. [`app/components/game/ScoreDisplay.tsx`](app/components/game/ScoreDisplay.tsx) - スコア表示コンポーネント
3. [`app/components/game/ActionButtons.tsx`](app/components/game/ActionButtons.tsx) - アクションボタン群
4. [`app/components/game/PlayerList.tsx`](app/components/game/PlayerList.tsx) - プレイヤー一覧表示

### API・ロジック（更新）

- [`app/lib/roomApi.ts`](app/lib/roomApi.ts) - `createRoom`関数を修正（ホストを自動参加させない）
- [`app/app/game/[id].tsx`](app/app/game/[id].tsx) - ゲーム画面に参加/退出機能を追加

### ドキュメント

- [`PHASE3_GAME_LAYOUT_COMPLETE.md`](PHASE3_GAME_LAYOUT_COMPLETE.md) - 実装内容の詳細
- [`PHASE3_TESTING_GUIDE_UPDATED.md`](PHASE3_TESTING_GUIDE_UPDATED.md) - 更新された動作確認手順

## 主な変更点

### 1. ルーム作成時の動作変更

**変更前:**

```typescript
// ホストの初期状態を作成
const hostInitialState: Record<string, number> = {};
template.variables.forEach((variable) => {
  hostInitialState[variable.key] = variable.initial;
});

// ルームを作成（ホストを current_state に追加）
current_state: {
  [user.id]: hostInitialState,
}
```

**変更後:**

```typescript
// ルームを作成（ホストは自動参加しない）
current_state: {}, // 空の状態で作成
```

### 2. ゲーム画面に参加/退出ボタンを追加

#### 新しいハンドラー関数

**`handleJoinGame`** - ゲーム参加

```typescript
const handleJoinGame = async () => {
  const { error } = await joinRoom(room.room_code);
  if (error) {
    Alert.alert("エラー", error.message);
  }
};
```

**`handleLeaveGame`** - ゲーム退出

```typescript
const handleLeaveGame = async () => {
  Alert.alert("確認", "ゲームから退出しますか？\n（ルームには残ります）", [
    { text: "キャンセル", style: "cancel" },
    {
      text: "退出",
      onPress: async () => {
        const currentState = { ...room.current_state };
        delete currentState[user.id];
        await supabase
          .from("rooms")
          .update({ current_state: currentState })
          .eq("id", room.id);
      },
    },
  ]);
};
```

#### UI 要素

**参加ボタン（緑色）:**

```tsx
<TouchableOpacity style={styles.joinButton} onPress={handleJoinGame}>
  <Text style={styles.joinButtonText}>🎮 ゲームに参加</Text>
</TouchableOpacity>
```

**退出ボタン（オレンジ色）:**

```tsx
<TouchableOpacity style={styles.leaveButton} onPress={handleLeaveGame}>
  <Text style={styles.leaveButtonText}>🚪 ゲームから退出</Text>
</TouchableOpacity>
```

### 3. アクションボタンの表示条件を変更

**変更前:**

```tsx
{
  room.status === "playing" && (
    <ActionButtons
      actions={room.template.actions}
      onActionPress={handleActionPress}
    />
  );
}
```

**変更後:**

```tsx
{
  room.status === "playing" && isUserInGame && (
    <ActionButtons
      actions={room.template.actions}
      onActionPress={handleActionPress}
    />
  );
}
```

参加していないユーザーにはアクションボタンが表示されなくなりました。

## 実装した機能の詳細

### PlayerCard コンポーネント

- プレイヤー名表示（現在のユーザーは「あなた」）
- ホストには王冠アイコン（👑）
- 変数値の動的表示
- シャドウとボーダーによる洗練されたデザイン

### ScoreDisplay コンポーネント

- ラベルと値のペア表示
- 3 つのサイズバリエーション（small/medium/large）
- カスタムカラー対応

### ActionButtons コンポーネント

- アクションの動的表示
- グリッドレイアウト
- 無効化状態のサポート
- タップフィードバック

### PlayerList コンポーネント

- PlayerCard を使用した一覧表示
- 空状態の適切な表示
- プレイヤー数バッジ

### 参加/退出機能

- **参加ボタン**: ゲームに参加していない場合に表示
- **退出ボタン**: ゲームに参加している場合に表示
- **確認ダイアログ**: 退出時に確認を求める
- **リアルタイム同期**: 参加/退出が即座に全デバイスに反映
- **全ユーザー対応**: ホストも一般プレイヤーも同じ機能を利用可能

**注意事項:**

- **ホスト**: ルーム作成時は自動参加しない（参加ボタンで明示的に参加）
- **一般プレイヤー**: ルーム入室時は自動参加する（`joinRoom`関数の仕様）
- **全ユーザー**: ゲーム途中での退出・再参加が可能

## デザインの特徴

### カラースキーム

- **参加ボタン**: `#10b981` (緑)
- **退出ボタン**: `#f59e0b` (オレンジ)
- **アクションボタン**: `#3b82f6` (青)
- **ゲーム開始**: `#10b981` (緑)
- **ゲーム終了**: `#ef4444` (赤)

### レイアウト

- **参加/退出ボタン**: プレイヤーリストの上部に配置
- **シャドウエフェクト**: ボタンとカードに奥行き感
- **レスポンシブ**: 画面サイズに応じて適切に配置

## 動作フロー

### ルーム作成からゲーム開始まで

1. **ルーム作成**

   - ホストがルームを作成
   - `current_state`は空の状態
   - 「0 人参加中」と表示

2. **ホストの参加**

   - 「🎮 ゲームに参加」ボタンをタップ
   - `joinRoom`関数が実行される
   - `current_state`にホストが追加される
   - 「1 人参加中」に更新

3. **他のプレイヤーの参加**

   - ルームコードで入室
   - 自動的に`current_state`に追加される
   - プレイヤー数が増加

4. **ゲーム開始**

   - ホストが「ゲーム開始」をタップ
   - ステータスが「playing」に変更
   - 参加しているプレイヤーにアクションボタンが表示

5. **ゲーム中の退出**

   - 「🚪 ゲームから退出」をタップ
   - 確認ダイアログで「退出」を選択
   - `current_state`から削除
   - アクションボタンが非表示に

6. **再参加**
   - 「🎮 ゲームに参加」をタップ
   - 再度`current_state`に追加
   - アクションボタンが再表示

## 技術的な詳細

### 状態管理

- `isUserInGame`: ユーザーがゲームに参加しているかを判定
- `room.current_state`: プレイヤーの参加状態を管理
- リアルタイム同期により、全デバイスで状態が一致

### データベース操作

- **参加**: `joinRoom`関数を使用（既存の API）
- **退出**: Supabase クライアントで直接`current_state`を更新

### エラーハンドリング

- 参加/退出時のエラーを Alert で表示
- 確認ダイアログでユーザーの意図を確認

## 検証方法

詳細な動作確認手順は [`PHASE3_TESTING_GUIDE_UPDATED.md`](PHASE3_TESTING_GUIDE_UPDATED.md) を参照してください。

### 基本的な確認手順

1. **空のルーム状態**

   - ルーム作成後、「0 人参加中」と表示される
   - 「🎮 ゲームに参加」ボタンが表示される

2. **ホストの参加**

   - ボタンをタップして参加
   - 「1 人参加中」に更新
   - 「🚪 ゲームから退出」ボタンに変わる

3. **ホストの退出**

   - ボタンをタップして退出
   - 確認ダイアログが表示される
   - 「0 人参加中」に戻る

4. **アクションボタンの表示**
   - 参加している場合のみ表示される
   - 退出すると非表示になる

## メリット

### ユーザー体験の向上

- ✅ ホストが観戦者として参加できる
- ✅ ゲーム途中での参加/退出が可能
- ✅ 柔軟なゲーム運営が可能

### 技術的なメリット

- ✅ 既存の API（`joinRoom`）を再利用
- ✅ シンプルな実装
- ✅ リアルタイム同期が正常に機能

## 次のステップ

Phase 3 の残りのタスク:

- [ ] タスク 5: Realtime サブスクリプションの実装
- [ ] タスク 6: 楽観的 UI 更新

## まとめ

Phase 3 の「1. ゲーム画面のレイアウト作成」が完了し、さらにユーザーフィードバックに基づいて参加/退出機能を追加しました。

**実装した内容:**

- 4 つの再利用可能なコンポーネント
- ゲーム画面のレイアウト改善
- ホストの参加/退出機能
- 参加状態に応じた UI 表示制御
- 洗練された UI デザイン

これにより、ホストは観戦者としてゲームを管理したり、途中から参加したりすることが可能になりました。
