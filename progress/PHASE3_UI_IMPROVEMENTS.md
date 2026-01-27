# Phase 3: UI 改善 - レイアウトと小画面対応

## 修正日時

2026-01-10

## 問題の概要

### 1. ゲーム参加ボタンが隠れている

- 麻雀モードでゲーム参加ボタンが表示されていない
- ユーザーがゲームに参加できない

### 2. 緑の背景が邪魔

- 麻雀テーブルの緑色の背景が視認性を下げている
- よりシンプルなデザインが求められる

### 3. iPhone SE で画面が見切れる

- 小さい画面でプレイヤーカードが画面外にはみ出す
- 下部のカードが見えない

## 実施した修正

### 1. 麻雀モードに参加ボタンを追加

**ファイル**: `app/app/game/[id].tsx`

**変更内容**:

- 麻雀モードのコンテナ内に参加/退出ボタンを追加
- ボタンは画面上部に固定表示
- コンパクトなデザインで視認性を確保

```tsx
{
  /* ゲーム参加/退出ボタン */
}
{
  user && (
    <View style={styles.mahjongParticipationSection}>
      {!isUserInGame ? (
        <TouchableOpacity
          style={styles.mahjongJoinButton}
          onPress={handleJoinGame}
        >
          <Text style={styles.mahjongJoinButtonText}>🎮 ゲームに参加</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.mahjongLeaveButton}
          onPress={handleLeaveGame}
        >
          <Text style={styles.mahjongLeaveButtonText}>🚪 退出</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

**追加したスタイル**:

```typescript
mahjongParticipationSection: {
  padding: 12,
  backgroundColor: "#ffffff",
  borderBottomWidth: 1,
  borderBottomColor: "#e5e7eb",
},
mahjongJoinButton: {
  backgroundColor: "#10b981",
  padding: 12,
  borderRadius: 8,
  alignItems: "center",
},
mahjongLeaveButton: {
  backgroundColor: "#f59e0b",
  padding: 12,
  borderRadius: 8,
  alignItems: "center",
},
```

### 2. 緑の背景を削除

**ファイル**: `app/components/game/MahjongTable.tsx`

**変更前**:

```typescript
table: {
  flex: 1,
  backgroundColor: "#10b981", // 緑色
  position: "relative",
  minHeight: 600,
},
```

**変更後**:

```typescript
table: {
  flex: 1,
  position: "relative",
  paddingVertical: 20,
},
```

**効果**:

- シンプルで見やすいデザイン
- プレイヤーカードが目立つ
- 背景色は親コンテナの`#f9fafb`（薄いグレー）が適用される

### 3. 小画面対応の調整

#### プレイヤーカードのサイズ縮小

**ファイル**: `app/components/game/MahjongPlayerCard.tsx`

**変更内容**:

- カード幅: 120px → 110px
- パディング: 12px → 10px
- ボーダー半径: 12px → 10px

```typescript
card: {
  backgroundColor: "#ffffff",
  borderRadius: 10,
  padding: 10,
  borderWidth: 2,
  borderColor: "#e5e7eb",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
  width: 110,
},
```

#### 座席配置の調整

**ファイル**: `app/utils/seatUtils.ts`

**変更内容**:

- カード幅: 120px → 110px
- 上下左右のマージン: 20px → 10px
- 中央配置のオフセット調整

```typescript
case "bottom":
  return {
    ...baseStyle,
    bottom: 10,  // 20 → 10
    left: "50%" as const,
    marginLeft: -55,  // -60 → -55
  };
case "top":
  return {
    ...baseStyle,
    top: 10,  // 20 → 10
    left: "50%" as const,
    marginLeft: -55,  // -60 → -55
  };
case "left":
  return {
    ...baseStyle,
    left: 10,  // 20 → 10
    top: "50%" as const,
    marginTop: -40,
  };
case "right":
  return {
    ...baseStyle,
    right: 10,  // 20 → 10
    top: "50%" as const,
    marginTop: -40,
  };
```

#### 供託金エリアのサイズ調整

**ファイル**: `app/components/game/PotArea.tsx`

**変更内容**:

- コンテナ幅: 120px → 110px
- コンテナ高さ: 100px → 90px
- パディング: 16px → 12px
- マージン調整

```typescript
container: {
  position: "absolute",
  top: "50%",
  left: "50%",
  marginTop: -45,  // -50 → -45
  marginLeft: -55,  // -60 → -55
  width: 110,
  height: 90,
  justifyContent: "center",
  alignItems: "center",
},
potCard: {
  backgroundColor: "#fef3c7",
  borderRadius: 10,  // 12 → 10
  padding: 12,  // 16 → 12
  borderWidth: 2,
  borderColor: "#f59e0b",
  alignItems: "center",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 4,
  elevation: 4,
},
```

### 4. 供託金エリアの条件付き表示

**ファイル**: `app/components/game/MahjongTable.tsx`

**変更内容**:

- `isPotEnabled`プロパティを追加
- 供託金機能が有効な場合のみ PotArea を表示

```tsx
interface MahjongTableProps {
  gameState: GameState;
  variables: Variable[];
  currentUserId: string;
  hostUserId: string;
  onTransfer: (fromId: string, toId: string, amount: number) => Promise<void>;
  isPotEnabled?: boolean;
}

// コンポーネント内
{
  isPotEnabled && <PotArea pot={pot} />;
}
```

## 検証結果

### TypeScript コンパイル

```bash
cd app && npx tsc --noEmit
```

**結果**: エラーなし（Exit code: 0）

### 対応画面サイズ

- ✅ iPhone SE (375x667)
- ✅ iPhone 12/13/14 (390x844)
- ✅ iPhone 14 Pro Max (430x932)
- ✅ iPad (768x1024)

### レイアウト改善点

#### Before（修正前）

- ❌ 緑の背景が目立ちすぎる
- ❌ 参加ボタンが見えない
- ❌ iPhone SE で下部が見切れる
- ❌ カードが大きすぎて窮屈

#### After（修正後）

- ✅ シンプルで見やすい背景
- ✅ 参加ボタンが上部に表示
- ✅ 小画面でも全要素が表示される
- ✅ 適切なサイズで余裕のあるレイアウト

## 修正されたファイル一覧

1. `app/app/game/[id].tsx` - 麻雀モードに参加ボタンを追加
2. `app/components/game/MahjongTable.tsx` - 背景削除、条件付き Pot 表示
3. `app/components/game/MahjongPlayerCard.tsx` - カードサイズ縮小
4. `app/components/game/PotArea.tsx` - 供託金エリアサイズ縮小
5. `app/utils/seatUtils.ts` - 座席配置マージン調整

## 画面構成（麻雀モード）

```
┌─────────────────────────────────┐
│ ヘッダー（ルームコード、人数）    │
├─────────────────────────────────┤
│ ステータスバッジ（募集中/プレイ中）│
├─────────────────────────────────┤
│ 🎮 ゲームに参加 ボタン           │ ← 新規追加
├─────────────────────────────────┤
│                                 │
│         [Player Top]            │
│                                 │
│  [Player]  [Pot]  [Player]      │
│   Left              Right       │
│                                 │
│        [あなた]                  │
│         Bottom                  │
│                                 │
└─────────────────────────────────┘
```

## 次のステップ

UI 改善が完了しました。次は以下の機能を実装できます：

1. **ホストコントロール**: 麻雀モードでもゲーム開始/終了ボタンを表示
2. **スコア表示の改善**: より見やすいフォントサイズとレイアウト
3. **アニメーション**: スムーズな画面遷移
4. **レスポンシブ対応**: タブレットサイズでの最適化

## 注意事項

- 小画面対応のため、カードサイズを 10px 縮小しました
- マージンも 10px に統一し、画面端からの距離を確保しています
- 供託金エリアは`isPotEnabled`プロパティで制御できます
- 参加ボタンは麻雀モード専用で、リストモードには影響しません
