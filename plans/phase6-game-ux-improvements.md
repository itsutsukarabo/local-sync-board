# Phase 6: ゲーム画面UX改善 - 矢印インタラクション刷新

## 概要
スコアカード間のドラッグ操作（支払い矢印）のデザインとインタラクションを大幅にブラッシュアップする。
`react-native-svg` + `react-native-reanimated` を活用し、流体的な矢印描画・スナップ吸着・触覚フィードバックなどを実装する。

---

## Phase 6.0: リファクタリング & 矢印ずれ修正

### 6.0.1: 矢印ずれの原因調査と修正

**現状の問題点:**
- SVG overlay が `width={SCREEN_WIDTH} height={SCREEN_HEIGHT}` で描画されているが、実際のコンテナ（`GestureHandlerRootView`）はヘッダーや履歴ログの下に配置されるため、画面全体とは一致しない
- `containerOffset` の測定タイミングに依存しており、レイアウトシフトで不正確になる可能性がある
- ドラッグ開始時の `onStart` で `event.absoluteX/Y` を使っているが、`handleDragStart` 内で `measureInWindow` の非同期コールバック内で状態設定するため、タイミングのずれが生じうる

**修正方針:**
- SVG overlay をコンテナ内に留め、コンテナ実サイズに合わせた `viewBox` を使用する（`onLayout` でコンテナサイズを取得）
- `containerOffset` の測定を `onLayout` イベントに統一し、タイムアウトベースの複数回測定を廃止
- ドラッグ座標系を一貫させる

**対象ファイル:**
- `app/components/game/MahjongTable.tsx` (主要)
- `app/components/game/MahjongPlayerCard.tsx` (位置測定)
- `app/components/game/PotArea.tsx` (位置測定)

### 6.0.2: ドラッグロジックの分離とリファクタリング

**目的:** 今後の機能追加（スナップ・アニメーション等）に備えてコードを整理

**変更内容:**
1. **カスタムフック `useDragInteraction` を作成**
   - ドラッグ状態管理（現在 `MahjongTable` 内の `dragState`、各種ハンドラ）を分離
   - React state → reanimated `useSharedValue` に移行（パフォーマンス向上、60fps描画）
   - ドロップ判定ロジックを含める

2. **SVG矢印コンポーネント `FluidArrow` を作成**
   - 現在の `<Line>` + `<Polygon>` を独立コンポーネントに切り出し
   - Phase 6.1 で流体形状に差し替えやすくする

3. **座標管理の改善**
   - `cardPositionsAbsolute` → `useSharedValue` ベースに変更（worklet内で直接参照可能に）
   - 絶対座標→相対座標変換を統一

**新規ファイル:**
- `app/hooks/useDragInteraction.ts`
- `app/components/game/FluidArrow.tsx`

**修正ファイル:**
- `app/components/game/MahjongTable.tsx` (大幅簡素化)

---

## Phase 6.1: 流体（リキッド）矢印の実装

### 6.1.1: ベジェ曲線による雫型シルエット

**描画仕様:**
- `react-native-svg` の `<Path>` で3次ベジェ曲線を使用
- 始点（自分の席）は太く丸みを帯びた形状（半径20px程度の円形から出発）
- 先端に向かって滑らかに細くなる雫型（teardrop shape）
- 距離が遠くなるほど中間の「腰」が細くなり、張力感を表現

**技術実装:**
```
形状イメージ:
  始点(太い) ──→ 中間(細い) ──→ 先端(尖る)

Path構造:
  M startX, startY-R          // 上側開始
  C cp1, cp2, endX, endY      // 上側カーブ
  C cp3, cp4, startX, startY+R // 下側カーブ（戻り）
  Z                            // 閉じる
```

- 幅の計算: `baseWidth = 24px`, `tipWidth = 4px`
- 距離に応じた中間幅: `midWidth = lerp(baseWidth, tipWidth, tension)`
- `tension` = `clamp(distance / maxDistance, 0, 1)`

**パフォーマンス:**
- Path の `d` 属性を reanimated の `useDerivedValue` で計算
- `react-native-svg` の `AnimatedPath` は直接サポートされないため、`useAnimatedProps` + Animated版SVGコンポーネント、もしくは毎フレーム Path の d 文字列を更新する方式を採用

**対象ファイル:**
- `app/components/game/FluidArrow.tsx` (6.0.2で作成したものを拡張)

### 6.1.2: カラーとグラデーション

- メインカラー: `#3b82f6` (現在の青) → グラデーション（始点: `#60a5fa`, 先端: `#2563eb`）
- `<LinearGradient>` を SVG 内で定義
- 吸着時: アクセントカラーに変化（`#10b981` 緑系）

---

## Phase 6.2: ターゲット吸着（スナップ）& ハイライト【最重要】

### 6.2.1: スナップ（マグネット効果）

**判定ロジック:**
- 各ターゲット（他席・供託）までの距離をフレームごとに計算
- 判定エリア: 中心から **60px** 以内でスナップ発動（現在のドロップ判定80pxより少し小さめ）
- スナップ時: 矢印先端を即座にターゲット中央へ移動（`withSpring` で微小バウンス付き）
- スナップ中に判定エリアから出たら解除（ヒステリシス: 解除は70pxで少し大きめにして、チラつき防止）

**実装方式:**
- `useDragInteraction` 内でスナップ対象を `useSharedValue<string | null>` で管理
- ドラッグ更新ごとに最近接ターゲットを計算
- スナップ先の座標を `withSpring()` で補間してFluidArrowに渡す

### 6.2.2: ターゲットカードのハイライト

**視覚フィードバック:**
- スナップ対象のカードに `highlightedTargetId` を prop で渡す
- ハイライト時のスタイル変更:
  - `transform: [{ scale: 1.08 }]` でわずかに拡大
  - `borderColor: '#3b82f6'` (青) → アクセントカラーに変更
  - `shadowRadius` を大きくしてグロー効果
- アニメーション: `withSpring({ damping: 15, stiffness: 150 })` で自然な拡縮

**対象ファイル:**
- `app/components/game/MahjongPlayerCard.tsx` (highlight prop追加)
- `app/components/game/PotArea.tsx` (同上)
- `app/hooks/useDragInteraction.ts` (スナップロジック)

### 6.2.3: 触覚フィードバック（Haptics）

**依存パッケージ:**
```bash
npx expo install expo-haptics
```

**フィードバックポイント:**
- スナップ（吸着）した瞬間: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)`
- スナップ解除時: なし（無音で自然に外れる）
- ドロップ成功時: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`

**注意:** Haptics は worklet 内で直接呼べないため `runOnJS` 経由で呼び出す

---

## Phase 6.3: キャンセルアニメーション（ゴムバンド効果）

### 実装詳細

**トリガー:** ターゲット判定エリア外で指を離した場合

**アニメーション:**
1. 指を離した瞬間、矢印先端の座標を始点に向かって `withSpring` で収縮
   - `damping: 12`, `stiffness: 200` (素早く縮む)
   - duration: 約300ms
2. 収縮完了後に矢印を非表示にする（`withTiming(0, { duration: 150 })` でopacity fade out）

**実装方式:**
- `dragState.isDragging` を即座に false にするのではなく、「retracting」状態を挟む
- `phase: 'idle' | 'dragging' | 'retracting'` の3状態管理
- retract アニメーション中は矢印を表示し続け、完了コールバックで 'idle' に戻す

**対象ファイル:**
- `app/hooks/useDragInteraction.ts`
- `app/components/game/FluidArrow.tsx`

---

## Phase 6.4: 波紋エフェクト（ディスカバラビリティ）

### 実装詳細

**対象:** 現在のユーザーの席カード（「あなた」のカード）のみ

**エフェクト仕様:**
- カード中央から外側に向かって薄い波紋（リング）がフワッと広がるアニメーション
- 2重リング: 同時に2つの波紋が少しずらして表示
- 各リングは `opacity: 0.4 → 0` 、`scale: 1.0 → 2.5` で広がる
- アニメーション周期: 3秒間隔でループ（常時ではなく、一定間隔）
- ドラッグ中は波紋を非表示にする

**技術実装:**
- `react-native-reanimated` の `useSharedValue` + `withRepeat` + `withSequence` で実装
- SVGの `<Circle>` で波紋リングを描画、もしくは RN の `View` + `borderRadius` + `transform` で実装
- パフォーマンス考慮: `useAnimatedStyle` でネイティブドライバ上で動作させる

**新規ファイル:**
- `app/components/game/RippleEffect.tsx`

**修正ファイル:**
- `app/components/game/MahjongPlayerCard.tsx` (波紋コンポーネント組み込み)

---

## Phase 6.5: タップ・着席時のHaptics

### 実装詳細

**フィードバックポイント:**
1. **カードタップ時:** `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
   - `MahjongPlayerCard` の `tapGesture.onEnd` 内で発火

2. **着席時:** `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`
   - `[id].tsx` の `handleJoinSeat` 成功後に発火

**対象ファイル:**
- `app/components/game/MahjongPlayerCard.tsx`
- `app/app/game/[id].tsx`

---

## 技術的検証結果

### 実現可能性: 全要件実現可能

1. **流体矢印（ベジェ曲線）**: `react-native-svg` の `<Path>` で3次ベジェ曲線を描画可能。reanimated との連携は、`useAnimatedProps` が `react-native-svg` のAnimatedコンポーネントで動作する（react-native-svg v13以降でサポート）。現在v15.15.1なので問題なし。

2. **スナップ吸着**: reanimated の `useSharedValue` + `withSpring` で滑らかなスナップアニメーション可能。ドラッグ中のフレームごとの距離計算も worklet 内で高速に実行可能。

3. **Haptics**: `expo-haptics` は Expo SDK 54 で完全サポート。ただし Web では動作しない（モバイルのみ）。`Platform.OS` でガードする。

4. **キャンセルアニメーション**: reanimated の `withSpring` でゴムバンド効果を実現可能。状態遷移（dragging → retracting → idle）で制御。

5. **波紋エフェクト**: `withRepeat` + `withDelay` + `withSequence` の組み合わせで周期的アニメーション可能。ネイティブドライバで動作するためパフォーマンス問題なし。

### 注意点

- **reanimated worklet制約**: Haptics呼び出し、React state更新は `runOnJS` 経由が必須
- **react-native-svg + reanimated連携**: AnimatedコンポーネントはSVGのアニメーション版を `Animated.createAnimatedComponent()` で作成するか、props更新で対応
- **Android Haptics**: AndroidではHapticsの種類が限定的（iOS比）。振動パターンの差異は許容する

---

## 実装順序とファイル影響範囲

```
Phase 6.0 (リファクタ)
  ├── MahjongTable.tsx          [大幅修正]
  ├── MahjongPlayerCard.tsx     [修正]
  ├── PotArea.tsx               [修正]
  ├── useDragInteraction.ts     [新規]
  └── FluidArrow.tsx            [新規]

Phase 6.1 (流体矢印)
  └── FluidArrow.tsx            [拡張]

Phase 6.2 (スナップ & ハイライト)
  ├── useDragInteraction.ts     [拡張]
  ├── MahjongPlayerCard.tsx     [修正: highlight prop]
  ├── PotArea.tsx               [修正: highlight prop]
  └── FluidArrow.tsx            [修正: snap座標対応]

Phase 6.3 (キャンセルアニメーション)
  ├── useDragInteraction.ts     [拡張: retract状態]
  └── FluidArrow.tsx            [修正: retractアニメーション]

Phase 6.4 (波紋エフェクト)
  ├── RippleEffect.tsx          [新規]
  └── MahjongPlayerCard.tsx     [修正: 波紋組み込み]

Phase 6.5 (Haptics)
  ├── expo-haptics              [パッケージ追加]
  ├── MahjongPlayerCard.tsx     [修正: tap haptics]
  ├── useDragInteraction.ts     [修正: snap/drop haptics]
  └── [id].tsx                  [修正: 着席 haptics]
```

**推定新規/修正ファイル数:** 新規3ファイル、修正5ファイル
