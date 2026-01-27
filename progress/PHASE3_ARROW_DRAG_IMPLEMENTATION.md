# Phase 3: 矢印ドラッグ方式の実装完了

## 実装内容

ドラッグ&ドロップ機能を、スコアボード自体を移動させる方式から、**矢印を表示する方式**に変更しました。

### 変更されたコンポーネント

#### 1. [`MahjongPlayerCard.tsx`](../app/components/game/MahjongPlayerCard.tsx)

- **変更点:**
  - カード自体は移動せず、ドラッグ中の座標のみを親コンポーネントに通知
  - `onDragStart`, `onDragUpdate`, `onDragEnd` コールバックで座標を送信
  - `onPositionMeasured` コールバックでカードの中心座標を親に通知
  - `translateX`, `translateY`, `scale` のアニメーションを削除

#### 2. [`MahjongTable.tsx`](../app/components/game/MahjongTable.tsx)

- **変更点:**
  - `dragState` ステートでドラッグ中の状態を管理
  - `cardPositions` ステートで各カードの座標を追跡
  - `potPosition` ステートで Pot の座標を追跡
  - **矢印の描画:** `react-native-svg` を使用してドラッグ中に矢印を表示
  - ドロップ先の判定ロジックを改善（各カード・Pot との距離で判定）

#### 3. [`PotArea.tsx`](../app/components/game/PotArea.tsx)

- **変更点:**
  - ドラッグ可能なオプションを追加（将来的に Pot からの回収に使用可能）
  - `onPositionMeasured` コールバックで Pot の中心座標を親に通知
  - `GestureDetector` を追加（現在は無効化）

### 新機能

#### 矢印の描画

- ドラッグ開始時にカードの中心から矢印が伸びる
- ドラッグ中は指の位置まで矢印が追従
- 矢印の先端には三角形の矢じりを表示
- 色: `#3b82f6` (青色)
- 線の太さ: 3px

#### ドロップ判定の改善

- **Pot へのドロップ:** Pot 中心から 80px 以内
- **プレイヤーカードへのドロップ:** カード中心から 80px 以内
- 最も近いターゲットを自動選択

### 依存関係の追加

```bash
npm install react-native-svg
```

## 動作フロー

### 1. 自分のカードから他のプレイヤーへ送金

1. 自分のカードをドラッグ開始
2. 青い矢印が表示され、指の動きに追従
3. 送金先のプレイヤーカード付近でドロップ
4. 金額入力モーダルが表示される
5. 金額を入力して確定

### 2. 自分のカードから Pot へ供託（リーチ）

1. 自分のカードをドラッグ開始
2. 青い矢印が表示され、指の動きに追従
3. 中央の Pot エリア付近でドロップ
4. 即座に 1000 点が供託される

## 動作確認手順

### 準備

1. アプリを起動

```bash
cd app
npm start
```

2. 2 つ以上のデバイス/エミュレータで同じルームに参加

### テストケース

#### ケース 1: プレイヤー間の送金

1. デバイス A で自分のスコアボードをドラッグ
2. **確認:** 青い矢印が表示され、指の動きに追従する
3. **確認:** カード自体は移動しない
4. デバイス B のプレイヤーカード付近でドロップ
5. **確認:** 金額入力モーダルが表示される
6. 金額を入力して「送金」をタップ
7. **確認:** 両方のデバイスでスコアが更新される

#### ケース 2: Pot への供託

1. デバイス A で自分のスコアボードをドラッグ
2. **確認:** 青い矢印が表示される
3. 中央の Pot エリア付近でドロップ
4. **確認:** 即座に 1000 点が供託される
5. **確認:** 両方のデバイスで Pot の金額が更新される

#### ケース 3: ドロップキャンセル

1. 自分のスコアボードをドラッグ
2. **確認:** 青い矢印が表示される
3. どのカードからも離れた場所でドロップ
4. **確認:** 何も起こらず、矢印が消える

#### ケース 4: 視覚的フィードバック

1. 自分のスコアボードをドラッグ
2. **確認:** 矢印の色が青色（#3b82f6）
3. **確認:** 矢印の先端に三角形の矢じりがある
4. **確認:** 矢印がスムーズに指の動きに追従する

### デバッグ方法

#### 座標の確認

コンソールログで以下を確認できます：

- カードの中心座標
- Pot の中心座標
- ドラッグ中の座標
- ドロップ先の判定結果

#### 問題が発生した場合

**矢印が表示されない:**

- `react-native-svg` がインストールされているか確認
- Metro bundler を再起動: `npm start -- --reset-cache`

**ドロップ判定が機能しない:**

- カード/Pot の座標が正しく測定されているか確認
- `onPositionMeasured` コールバックが呼ばれているか確認
- 判定距離（80px）を調整してみる

**矢印の描画がおかしい:**

- `Svg` コンポーネントの `pointerEvents="none"` が設定されているか確認
- `StyleSheet.absoluteFill` が適用されているか確認

## 今後の改善案

### 1. 視覚的フィードバックの強化

- ドロップ可能なターゲットをハイライト表示
- ドロップ可能範囲に入ったら矢印の色を変更（緑色など）
- ドロップ不可能な場所では矢印を赤色に

### 2. アニメーション

- 送金成功時にコインが飛ぶアニメーション
- 矢印の描画にスプリングアニメーションを追加

### 3. Pot からの回収機能

- Pot エリアをドラッグ可能にする
- Pot から自分のカードへドラッグして回収

### 4. マルチタッチ対応

- 複数のプレイヤーが同時にドラッグできるように

## 技術的な詳細

### 座標系

- `measureInWindow()` を使用してグローバル座標を取得
- カードの中心座標 = `x + width / 2`, `y + height / 2`
- ドラッグ中の座標 = カード中心 + ドラッグ量

### 矢印の計算

```typescript
// 矢印の先端（矢じり）の計算
const angle = Math.atan2(y2 - y1, x2 - x1);
const arrowLength = 15;
const arrowAngle = Math.PI / 6;

const point1X = x2 - arrowLength * Math.cos(angle - arrowAngle);
const point1Y = y2 - arrowLength * Math.sin(angle - arrowAngle);
const point2X = x2 - arrowLength * Math.cos(angle + arrowAngle);
const point2Y = y2 - arrowLength * Math.sin(angle + arrowAngle);
```

### ドロップ判定

```typescript
// ユークリッド距離で判定
const distance = Math.sqrt(Math.pow(x - targetX, 2) + Math.pow(y - targetY, 2));

if (distance < 80) {
  // ドロップ成功
}
```

## 完了日

2026-01-11

## 関連ファイル

- [`app/components/game/MahjongPlayerCard.tsx`](../app/components/game/MahjongPlayerCard.tsx)
- [`app/components/game/MahjongTable.tsx`](../app/components/game/MahjongTable.tsx)
- [`app/components/game/PotArea.tsx`](../app/components/game/PotArea.tsx)
- [`app/package.json`](../app/package.json)
