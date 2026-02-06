# Phase 4: 精算機能

## 概要
ゲーム終了時の精算機能を実装し、精算結果の履歴表示・カスタマイズを可能にする。

---

## データ構造

### Settlement型（精算結果）
```typescript
interface SettlementPlayerResult {
  displayName: string;
  finalScore: number;    // 精算前の最終スコア
  rank: number;          // 順位（1〜4）
  rankBonus: number;     // 順位点（+10000, -20000等）
  adjustedScore: number; // 順位点適用後のスコア
  divided: number;       // 1000で割った値（端数調整前、小数点第一位まで）
  result: number;        // 最終結果（端数調整後、表に表示される値、小数点第一位まで）
}

interface Settlement {
  id: string;            // UUID
  timestamp: number;     // Unix timestamp (ms)
  type: "settlement" | "adjustment";  // 精算 or 調整行
  playerResults: {
    [userId: string]: SettlementPlayerResult;
  };
}
```

### GameTemplate拡張（関数設定）
```typescript
interface SettlementConfig {
  divider: number;       // 割る数（デフォルト: 1000）
  rankBonuses: {
    3: number[];         // 3人時の順位点 [1位, 2位, 3位]
    4: number[];         // 4人時の順位点 [1位, 2位, 3位, 4位]
  };
}

interface GameTemplate {
  // 既存のプロパティ...
  settlementConfig?: SettlementConfig;
}
```

### current_state拡張
```typescript
type GameState = {
  __pot__?: PotState;
  __history__?: HistoryEntry[];
  __settlements__?: Settlement[];  // 追加
} & {
  [userId: string]: PlayerState;
};
```

---

## Task 4.1: 型定義とデフォルト設定

### 目的
精算機能に必要な型定義とデフォルトテンプレートの更新。

### 実装内容

#### 1. 型定義の追加
**ファイル**: `app/types/index.ts`

- `SettlementPlayerResult` 型を追加
- `Settlement` 型を追加
- `SettlementConfig` 型を追加
- `GameTemplate` に `settlementConfig` を追加
- `GameState` に `__settlements__` を追加

#### 2. デフォルトテンプレートの更新
**ファイル**: `app/utils/roomUtils.ts`

```typescript
export const DEFAULT_MAHJONG_TEMPLATE: GameTemplate = {
  // 既存の設定...
  settlementConfig: {
    divider: 1000,
    rankBonuses: {
      3: [5000, -40000, -70000],
      4: [10000, -20000, -40000, -50000],
    },
  },
};
```

### 完了条件
- [ ] 精算関連の型定義が追加されている
- [ ] デフォルトテンプレートに `settlementConfig` が設定されている
- [ ] TypeScriptコンパイルが通る

---

## Task 4.2: 精算履歴表示UI

### 目的
右スワイプで精算履歴表を表示する機能を実装。

### UI設計

```
┌───────────────────────────────────────────────────┐
│                精算履歴                            │
├───────────────────────────────────────────────────┤
│         │ PlayerA │ PlayerB │ PlayerC │ PlayerD  │
├───────────────────────────────────────────────────┤
│ 半荘1   │  +55.0  │  +12.0  │  -22.0  │  -45.0   │
│ 半荘2   │  -12.5  │  +25.0  │  -13.0  │   +0.5   │
│ (調整)  │   +1.0  │   -1.0  │    0    │    0     │
├───────────────────────────────────────────────────┤
│ 合計    │  +43.5  │  +36.0  │  -35.0  │  -44.5   │
└───────────────────────────────────────────────────┘

※数値は小数点第一位まで表示
```

### 実装内容

#### 1. SettlementHistoryScreenの作成
**ファイル**: `app/components/game/SettlementHistoryScreen.tsx`

**Props**:
```typescript
interface SettlementHistoryScreenProps {
  settlements: Settlement[];
  onClose: () => void;
  isHost: boolean;
  onDeleteSettlement?: (settlementId: string) => void;
  onAddAdjustment?: () => void;
}
```

**機能**:
- 横スクロール可能な表形式で表示
- 各行の左端に「半荘N」または「(調整)」のラベル
- 最下部に合計行（SUM）
- ホストのみ: 最新の精算行に「削除」ボタン
- ホストのみ: 「調整を追加」ボタン

#### 2. GameScreenへの統合
**ファイル**: `app/screens/GameScreen.tsx`

- 横スワイプジェスチャーの追加（react-native-gesture-handler）
- スワイプで `SettlementHistoryScreen` を表示/非表示

### 完了条件
- [ ] 右スワイプで精算履歴画面が表示される
- [ ] 表形式で精算結果が表示される
- [ ] 合計行が正しく計算されている
- [ ] 左スワイプまたは閉じるボタンで元の画面に戻れる

---

## Task 4.3: 精算実行機能

### 目的
ホストが「精算」ボタンを押して精算を実行できるようにする。

### 実装内容

#### 1. 精算ロジックの実装
**ファイル**: `app/utils/settlementUtils.ts`（新規作成）

```typescript
/**
 * 精算を実行し、Settlement オブジェクトを生成
 */
export function executeSettlement(
  currentState: GameState,
  seats: (SeatInfo | null)[],
  config: SettlementConfig,
  variables: Variable[]
): Settlement {
  // 1. 着席者を抽出
  // 2. scoreでランキング付け
  // 3. 順位点を適用
  // 4. dividerで割る
  // 5. 最終順位で端数調整（合計が0になるように）
  // 6. Settlement オブジェクトを返す
}

/**
 * 精算可能かチェック
 */
export function canExecuteSettlement(
  currentState: GameState,
  seats: (SeatInfo | null)[],
  variables: Variable[]
): { canExecute: boolean; reason?: string } {
  // 1. 合計点 = 初期値 × 着席者数 かチェック
  // 2. 同点のプレイヤーがいないかチェック（同点がいたらdisable）
}
```

#### 2. HostControlsに「精算」ボタン追加
**ファイル**: `app/components/game/HostControls.tsx`

- 「精算」ボタンを追加
- `canExecuteSettlement` で有効/無効を制御
- 無効時は理由を表示:
  - 「合計点が一致しません」
  - 「同点のプレイヤーがいます」
- 確認ダイアログを表示（「精算を実行しますか？スコアは自動でリセットされます」）

#### 3. Supabase更新
**ファイル**: `app/services/roomService.ts`

```typescript
/**
 * 精算結果を保存
 */
export async function saveSettlement(
  roomId: string,
  settlement: Settlement
): Promise<void> {
  // current_stateの__settlements__に追加
}
```

### 精算アルゴリズム詳細

```
入力: 着席者のスコア、順位点設定、割る数

前提条件（canExecuteSettlementでチェック済み）:
- 合計点 = 初期値 × 着席者数
- 同点のプレイヤーがいない

1. ランキング付け
   - scoreで降順ソート
   - ※同点は事前にブロックされているため考慮不要

2. 順位点適用
   - 各プレイヤーに順位点を加算
   - adjustedScore = finalScore + rankBonus

3. 割り算（小数点第一位まで保持）
   - divided = Math.floor(adjustedScore / divider * 10) / 10
   - ※小数点第二位以下を切り捨て

4. 端数調整
   - 1位〜(N-1)位の divided を合計
   - 最終順位の result = -(1位〜(N-1)位の合計)
   - これにより全員の合計が0になる

5. スコアリセット（自動実行）
   - 精算完了後、全員のscoreを初期値にリセット
   - ※score以外の変数（本数など）はリセットしない

例（4人、25000点持ち）:
  A: 45000 → 1位 → +10000 = 55000 → 55.0 → 55.0
  B: 32000 → 2位 → -20000 = 12000 → 12.0 → 12.0
  C: 18000 → 3位 → -40000 = -22000 → -22.0 → -22.0
  D:  5000 → 4位 → -50000 = -45000 → -45.0 → -45.0
  合計: 0

  精算後 → 全員のscoreが25000にリセット
```

### 完了条件
- [ ] ホストコントロールに「精算」ボタンがある
- [ ] 合計点が正しくない場合はボタンが無効
- [ ] 同点のプレイヤーがいる場合はボタンが無効
- [ ] 精算実行で正しい結果が計算される（小数点第一位まで）
- [ ] 結果が `__settlements__` に保存される
- [ ] 精算後、全員のscoreが自動で初期値にリセットされる
- [ ] 他のプレイヤーにもリアルタイムで反映される

---

## Task 4.4: 関数設定UI

### 目的
ホストが精算の設定（順位点、割る数）をカスタマイズできるようにする。

### UI設計

```
┌─────────────────────────────────────────────┐
│           精算設定                           │
├─────────────────────────────────────────────┤
│ 割る数: [ 1000 ]                            │
├─────────────────────────────────────────────┤
│ ▼ 3人時の順位点                             │
│   1位: [ +5000  ]                           │
│   2位: [ -40000 ]                           │
│   3位: [ -70000 ]                           │
├─────────────────────────────────────────────┤
│ ▼ 4人時の順位点                             │
│   1位: [ +10000 ]                           │
│   2位: [ -20000 ]                           │
│   3位: [ -40000 ]                           │
│   4位: [ -50000 ]                           │
├─────────────────────────────────────────────┤
│ [リセット]                    [保存]        │
└─────────────────────────────────────────────┘
```

### 実装内容

#### 1. SettlementConfigEditorの作成
**ファイル**: `app/components/settings/SettlementConfigEditor.tsx`

**Props**:
```typescript
interface SettlementConfigEditorProps {
  config: SettlementConfig;
  onChange: (config: SettlementConfig) => void;
}
```

#### 2. GameSettingsScreenへの統合
**ファイル**: `app/screens/GameSettingsScreen.tsx`

- 「精算設定」セクションを追加
- `SettlementConfigEditor` を配置

### 完了条件
- [ ] 設定画面に「精算設定」セクションがある
- [ ] 割る数を変更できる
- [ ] 3人/4人それぞれの順位点を変更できる
- [ ] 設定変更が保存される

---

## Task 4.5: 調整行追加機能

### 目的
過去の精算結果を直接編集する代わりに、調整行を追加できるようにする。

### UI設計

```
┌─────────────────────────────────────────────┐
│           調整を追加                         │
├─────────────────────────────────────────────┤
│ PlayerA: [ +5.0 ]                           │
│ PlayerB: [ -5.0 ]                           │
│ PlayerC: [  0   ]                           │
│ PlayerD: [  0   ]                           │
├─────────────────────────────────────────────┤
│ 合計: 0  ✓                                  │
├─────────────────────────────────────────────┤
│ [キャンセル]                  [追加]        │
└─────────────────────────────────────────────┘

※合計が0でない場合は「追加」ボタン無効
※小数点第一位まで入力可能
```

### 実装内容

#### 1. AdjustmentModalの作成
**ファイル**: `app/components/game/AdjustmentModal.tsx`

**Props**:
```typescript
interface AdjustmentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (adjustments: { [userId: string]: number }) => void;
  players: { userId: string; displayName: string }[];
}
```

**機能**:
- 各プレイヤーの調整値を入力
- 合計が0になるかリアルタイムでチェック
- 合計が0でない場合は「追加」ボタンを無効化

#### 2. 精算履歴画面への統合
- 「調整を追加」ボタンからモーダルを開く
- 確定時に `type: "adjustment"` の Settlement を追加

### 完了条件
- [ ] 「調整を追加」ボタンがある（ホストのみ）
- [ ] 各プレイヤーの調整値を入力できる
- [ ] 合計が0でないと追加できない
- [ ] 調整行が履歴に表示される

---

## Task 4.6: 精算削除機能

### 目的
最新の精算結果を削除できるようにする。

### 実装内容

#### 1. 削除確認ダイアログ
- 「この精算を削除しますか？」と確認
- 削除すると `__settlements__` から該当エントリを削除

#### 2. 削除ボタンの表示条件
- ホストのみ表示
- 最新の精算/調整行のみ削除可能（過去のものは不可）

### 完了条件
- [ ] 最新の精算行に削除ボタンがある（ホストのみ）
- [ ] 削除確認ダイアログが表示される
- [ ] 削除後、履歴から消える

---

## 実装順序

1. **Task 4.1**: 型定義とデフォルト設定
2. **Task 4.3**: 精算実行機能（コア機能）
3. **Task 4.2**: 精算履歴表示UI
4. **Task 4.4**: 関数設定UI
5. **Task 4.5**: 調整行追加機能
6. **Task 4.6**: 精算削除機能

---

## 関連ファイル

### 新規作成
- `app/utils/settlementUtils.ts` - 精算ロジック
- `app/components/game/SettlementHistoryScreen.tsx` - 精算履歴画面
- `app/components/game/AdjustmentModal.tsx` - 調整追加モーダル
- `app/components/settings/SettlementConfigEditor.tsx` - 精算設定エディタ

### 変更
- `app/types/index.ts` - 型定義追加
- `app/utils/roomUtils.ts` - デフォルトテンプレート更新
- `app/components/game/HostControls.tsx` - 精算ボタン追加
- `app/screens/GameScreen.tsx` - スワイプジェスチャー追加
- `app/screens/GameSettingsScreen.tsx` - 精算設定セクション追加
- `app/services/roomService.ts` - 精算保存処理追加

---

## 備考

### 割り算の詳細
- 小数点第二位以下を切り捨て（小数点第一位まで保持）
- 実装: `Math.floor(value / divider * 10) / 10`
- 例: 55678 / 1000 = 55.678 → 55.6

### 端数調整の詳細
- 精算結果の合計は必ず0になる必要がある
- 1位から(N-1)位までは単純に割り算
- 最終順位のプレイヤーが端数を吸収（合計が0になるように調整）

### 同点処理
- 同点のプレイヤーがいる場合は精算不可（ボタン無効）
- ユーザーには「誰か1人に1点移動して順位を確定させてください」と案内
- 理由: 同点時の順位決定ルールが麻雀の流派によって異なるため、明示的に順位をつけてもらう運用

### 精算後の自動リセット
- 精算完了後、score変数のみを初期値にリセット
- 他の変数（本数など）はリセットしない
- これにより次の半荘をすぐに開始できる

### マイグレーション
- 既存の部屋には `settlementConfig` がない
- 精算実行時にデフォルト値を使用するフォールバック処理が必要
