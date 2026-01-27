# Phase 3: TypeScript エラーとレイアウト問題の修正完了

## 修正日時

2026-01-10

## 問題の概要

### 1. TypeScript エラー

- JSX が認識されない（`--jsx` フラグエラー）
- `esModuleInterop` エラー
- プレイヤーカードの配置に関する型エラー

### 2. レイアウト問題

- 麻雀ゲーム画面で緑の背景と Pot しか表示されない
- プレイヤーカードが正しく配置されていない

## 実施した修正

### 1. tsconfig.json の修正

**ファイル**: `app/tsconfig.json`

以下の設定を追加：

```json
{
  "compilerOptions": {
    "jsx": "react-native",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

**効果**:

- JSX の構文が正しく認識されるようになった
- React のデフォルトインポートが正常に動作するようになった

### 2. seatUtils.ts の修正

**ファイル**: `app/utils/seatUtils.ts`

**変更内容**:

- `alignSelf`プロパティを削除（`position: absolute`と互換性がないため）
- 中央配置を`left: "50%"`と`marginLeft`で実装

**修正前**:

```typescript
case "bottom":
  return { ...baseStyle, bottom: 20, alignSelf: "center" as const };
```

**修正後**:

```typescript
case "bottom":
  return {
    ...baseStyle,
    bottom: 20,
    left: "50%" as const,
    marginLeft: -60
  };
```

**効果**:

- プレイヤーカードが正しい位置に配置されるようになった
- 上下左右の 4 つの座席位置が正確に表示される

### 3. MahjongPlayerCard.tsx の修正

**ファイル**: `app/components/game/MahjongPlayerCard.tsx`

**変更内容**:

1. `getSeatStyle`をインポート
2. コンポーネントに外側のコンテナ View を追加
3. 位置スタイルを外側のコンテナに適用

**修正後の構造**:

```tsx
const positionStyle = getSeatStyle(position);

return (
  <View style={[styles.container, positionStyle]}>
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.card, animatedStyle]}>
        {/* カードの内容 */}
      </Animated.View>
    </GestureDetector>
  </View>
);
```

**効果**:

- ドラッグ&ドロップ機能を保持しながら正しい位置に配置
- アニメーションが正常に動作

### 4. MahjongTable.tsx の修正

**ファイル**: `app/components/game/MahjongTable.tsx`

**変更内容**:

1. 不要な`playerContainer`スタイルを削除
2. プレイヤー状態の型チェックを改善

**修正後**:

```tsx
{
  playerIds.map((playerId) => {
    const position = seatMap[playerId];
    if (!position) return null;

    const playerState = gameState[playerId];
    // __pot__でないことを確認
    if (
      !playerState ||
      typeof playerState !== "object" ||
      !("score" in playerState)
    ) {
      return null;
    }

    return (
      <MahjongPlayerCard
        key={playerId}
        playerId={playerId}
        playerState={playerState}
        variables={variables}
        isCurrentUser={playerId === currentUserId}
        isHost={playerId === hostUserId}
        position={position}
        onDrop={handleDrop}
      />
    );
  });
}
```

**効果**:

- プレイヤーカードが直接配置され、余分なラッパーがない
- `__pot__`との型の混同を回避

## 検証結果

### TypeScript コンパイル

```bash
cd app && npx tsc --noEmit
```

**結果**: エラーなし（Exit code: 0）

### 期待される動作

1. **麻雀テーブルレイアウト**:

   - 緑色の麻雀卓が表示される
   - 中央に供託金（Pot）エリアが表示される
   - プレイヤーカードが 4 方向（上下左右）に正しく配置される
   - 自分のカードは常に画面下部に表示される

2. **プレイヤーカード**:

   - 各プレイヤーの名前とスコアが表示される
   - ホストには 👑 アイコンが表示される
   - 自分のカードは「あなた」と表示される
   - ドラッグ&ドロップが可能（自分のカードのみ）

3. **インタラクション**:
   - 自分のカードを中央にドラッグ → リーチ（1000 点供託）
   - 自分のカードを他のプレイヤーにドラッグ → 支払いモーダル表示
   - Pot エリアをドラッグ → 供託金回収

## 修正されたファイル一覧

1. `app/tsconfig.json` - TypeScript 設定の追加
2. `app/utils/seatUtils.ts` - 座席配置スタイルの修正
3. `app/components/game/MahjongPlayerCard.tsx` - コンポーネント構造の改善
4. `app/components/game/MahjongTable.tsx` - レイアウトロジックの最適化

## 次のステップ

麻雀ゲームの基本レイアウトと TypeScript エラーが修正されました。次は以下の機能を実装できます：

1. **ドロップターゲットの改善**: 他のプレイヤーカードへのドロップ判定を実装
2. **視覚的フィードバック**: ドラッグ中のハイライト表示
3. **アニメーション**: スコア移動時のアニメーション効果
4. **エラーハンドリング**: 不正な操作の防止とユーザーへの通知

## 注意事項

- プレイヤーカードの位置は`position: absolute`で配置されているため、親要素（`table`）は`position: relative`である必要があります
- ドラッグ&ドロップ機能は`react-native-gesture-handler`と`react-native-reanimated`に依存しています
- 供託金（Pot）エリアも`position: absolute`で中央に配置されています
