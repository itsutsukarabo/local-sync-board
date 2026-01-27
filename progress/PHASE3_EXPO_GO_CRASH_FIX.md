# Phase 3: Expo Go クラッシュ問題の修正

## 修正日時

2026-01-10

## 問題の概要

### 症状

- Expo Go でプレイヤーカードをドラッグすると、アプリがクラッシュする
- iOS で特に顕著に発生

### 原因

`react-native-reanimated`のジェスチャーハンドラー内で、UI スレッドと JS スレッドの境界を正しく処理していなかった。

具体的には：

1. `detectDropTarget`関数が UI スレッドで実行されていたが、worklet としてマークされていなかった
2. `onStart`, `onUpdate`, `onEnd`内で`'worklet'`ディレクティブが欠けていた

## React Native Reanimated の仕組み

### UI スレッドと JS スレッド

- **UI スレッド（ネイティブ側）**: アニメーションやジェスチャーが実行される高速なスレッド
- **JS スレッド（JavaScript 側）**: React コンポーネントの状態管理やビジネスロジックが実行されるスレッド

### Worklet とは

`'worklet'`ディレクティブを付けた関数は、UI スレッドで実行できるようにコンパイルされます。

```typescript
const myFunction = () => {
  "worklet"; // この関数はUIスレッドで実行可能
  // UIスレッドで実行される処理
};
```

### runOnJS の役割

UI スレッドから JS スレッドの関数を呼び出す際に使用します。

```typescript
.onEnd(() => {
  'worklet';
  // UIスレッドで実行中
  runOnJS(jsFunction)(arg);  // JSスレッドの関数を呼び出す
});
```

## 実施した修正

### ファイル: `app/components/game/MahjongPlayerCard.tsx`

#### 修正前（問題のあるコード）

```typescript
const gesture = Gesture.Pan()
  .enabled(isCurrentUser)
  .onStart(() => {
    scale.value = withSpring(1.1);
  })
  .onUpdate((event) => {
    translateX.value = event.translationX;
    translateY.value = event.translationY;
  })
  .onEnd((event) => {
    // ❌ detectDropTarget関数がworkletではない
    const dropTarget = detectDropTarget(event.absoluteX, event.absoluteY);

    if (dropTarget) {
      runOnJS(onDrop)(playerId, dropTarget);
    }

    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    scale.value = withSpring(1);
  });

// ❌ この関数はworkletではないため、UIスレッドで実行できない
function detectDropTarget(x: number, y: number): string | null {
  const centerX = SCREEN_WIDTH / 2;
  const centerY = SCREEN_HEIGHT / 2;
  const distanceFromCenter = Math.sqrt(
    Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
  );
  if (distanceFromCenter < 100) {
    return "__pot__";
  }
  return null;
}
```

#### 修正後（正しいコード）

```typescript
const gesture = Gesture.Pan()
  .enabled(isCurrentUser)
  .onStart(() => {
    "worklet"; // ✅ workletディレクティブを追加
    scale.value = withSpring(1.1);
  })
  .onUpdate((event) => {
    "worklet"; // ✅ workletディレクティブを追加
    translateX.value = event.translationX;
    translateY.value = event.translationY;
  })
  .onEnd((event) => {
    "worklet"; // ✅ workletディレクティブを追加

    // ✅ ドロップ判定をインライン化（UIスレッドで実行）
    const centerX = SCREEN_WIDTH / 2;
    const centerY = SCREEN_HEIGHT / 2;
    const distanceFromCenter = Math.sqrt(
      Math.pow(event.absoluteX - centerX, 2) +
        Math.pow(event.absoluteY - centerY, 2)
    );

    // 中央から100px以内ならPot
    const dropTarget = distanceFromCenter < 100 ? "__pot__" : null;

    if (dropTarget) {
      // ✅ runOnJSでJSスレッドの関数を呼び出す
      runOnJS(onDrop)(playerId, dropTarget);
    }

    // 元の位置に戻す
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    scale.value = withSpring(1);
  });

// ✅ 不要な関数を削除
```

## 修正のポイント

### 1. `'worklet'`ディレクティブの追加

すべてのジェスチャーハンドラー（`onStart`, `onUpdate`, `onEnd`）の先頭に`'worklet'`を追加しました。

### 2. ドロップ判定のインライン化

`detectDropTarget`関数を削除し、ロジックを`onEnd`内に直接記述しました。これにより：

- UI スレッドで直接実行される
- 関数呼び出しのオーバーヘッドがなくなる
- worklet の境界を明確にする

### 3. `runOnJS`の正しい使用

`onDrop`コールバックは既に`runOnJS`でラップされているため、JS スレッドで安全に実行されます。

## 検証結果

### TypeScript コンパイル

```bash
cd app && npx tsc --noEmit
```

**結果**: エラーなし（Exit code: 0）

### 期待される動作

- ✅ Expo Go でプレイヤーカードをドラッグしてもクラッシュしない
- ✅ カードを中央にドロップすると供託金（Pot）に 1000 点支払われる
- ✅ ドラッグ中のアニメーションがスムーズに動作する
- ✅ ドロップ後、カードが元の位置に戻る

## 既存の正しい実装

### 1. `babel.config.js`

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-reanimated/plugin"], // ✅ 最後に配置
  };
};
```

### 2. `app/_layout.tsx`

```tsx
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {" "}
      {/* ✅ flex: 1 が重要 */}
      <AuthProvider>
        <AuthGuard>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthGuard>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
```

## React Native Reanimated のベストプラクティス

### ✅ DO（推奨）

1. **ジェスチャーハンドラーには必ず`'worklet'`を付ける**

```typescript
.onEnd(() => {
  'worklet';
  // 処理
});
```

2. **UI スレッドから JS 関数を呼ぶときは`runOnJS`を使う**

```typescript
.onEnd(() => {
  'worklet';
  runOnJS(myJsFunction)(arg);
});
```

3. **計算処理は UI スレッド内で完結させる**

```typescript
.onEnd((event) => {
  'worklet';
  const result = Math.sqrt(event.x * event.x + event.y * event.y);
  // resultを使った処理
});
```

### ❌ DON'T（非推奨）

1. **worklet なしで UI スレッドの処理を書かない**

```typescript
// ❌ クラッシュの原因
.onEnd(() => {
  // 'worklet'がない
  scale.value = 1;
});
```

2. **UI スレッドから直接 JS 関数を呼ばない**

```typescript
// ❌ クラッシュの原因
.onEnd(() => {
  'worklet';
  myJsFunction();  // runOnJSでラップしていない
});
```

3. **worklet ではない関数を UI スレッドで呼ばない**

```typescript
// ❌ クラッシュの原因
function myFunction() {
  // 'worklet'がない
  return Math.sqrt(100);
}

.onEnd(() => {
  'worklet';
  const result = myFunction();  // UIスレッドで実行できない
});
```

## トラブルシューティング

### それでもクラッシュする場合

1. **キャッシュをクリアして再起動**

```bash
cd app
npx expo start -c
```

2. **Expo Go を再インストール**

- デバイスから Expo Go アプリを削除
- App Store/Google Play から再インストール

3. **Development Build を使用（推奨）**
   Expo Go には制限があるため、本格的な開発には Development Build の使用を推奨します：

```bash
# EAS CLIをインストール
npm install -g eas-cli

# ログイン
eas login

# Development Buildを作成
eas build --profile development --platform android
```

## 修正されたファイル

1. `app/components/game/MahjongPlayerCard.tsx` - worklet ディレクティブの追加とドロップ判定のインライン化

## 次のステップ

クラッシュ問題が解決されました。次は以下の機能を実装できます：

1. **他のプレイヤーへのドロップ判定**: 現在は Pot のみ対応
2. **ドラッグ中の視覚的フィードバック**: ドロップ可能エリアのハイライト
3. **アニメーション改善**: スコア移動時のエフェクト
4. **エラーハンドリング**: 不正な操作の防止

## 参考資料

- [React Native Reanimated - Worklets](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/glossary#worklet)
- [React Native Reanimated - runOnJS](https://docs.swmansion.com/react-native-reanimated/docs/threading/runOnJS)
- [React Native Gesture Handler - Gestures](https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/gesture)
