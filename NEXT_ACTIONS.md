# NEXT_ACTIONS.md - 次に着手すべきタスク

## 設計思想

このアプリは **「あらゆるゲームを円滑に進める汎用スコアボード」** を目指しています。

- **ホストがボード・関数を設定** - テンプレートでゲームルールを定義
- **プレイヤーが運用** - シンプルな操作でスコア移動
- **ルール判定は実装しない** - 人間が判断し、アプリは記録・同期に徹する
- **座席は空席許容** - 何人でも対応可能
- **actions配列は権限リスト** - 許可された操作の定義として使用
- **全履歴を保持** - 任意の時点への復元（タイムトラベル）が可能

---

## Phase 3 残タスク

### Task 1: ActionButtonsコンポーネントの削除

**目的:**
UI上の「ツモ」「ロン」「リーチ」等の固定アクションボタンを削除する。
（汎用アプリとして、特定ゲームのボタンを持たせない）

**実装内容:**

1. `game/[id].tsx` から以下を削除:
   - `ActionButtons` コンポーネントのimport
   - `ActionButtons` コンポーネントの呼び出し部分
   - `handleActionPress` 関数

2. 削除対象コード箇所:
   - `app/app/game/[id].tsx:21` - import文
   - `app/app/game/[id].tsx:108-124` - handleActionPress関数
   - `app/app/game/[id].tsx:450-455` - ActionButtonsコンポーネント呼び出し

3. `ActionButtons.tsx` ファイル自体は一旦保留（将来別用途の可能性）

**完了条件:**
- [ ] リストモード画面からアクションボタンが消えている
- [ ] TypeScriptエラーがない

---

### Task 2: actions配列の権限リスト化

**目的:**
`actions` 配列を「UIボタン定義」から「許可された操作権限のリスト」に再定義する。

**権限キー定義:**

| キー | 説明 | 対象 |
|------|------|------|
| `transfer_score` | 他プレイヤーへの送金 | 全員 |
| `retrieve_pot` | Potからの回収 | 全員 |
| `finalize_game` | 精算機能の起動 | ホストのみ（予定） |

**実装内容:**

1. **型定義の変更** (`app/types/index.ts`)
   ```typescript
   // Before
   export interface Action {
     label: string;
     calc: string;
   }

   // After
   export type ActionPermission =
     | "transfer_score"
     | "retrieve_pot"
     | "finalize_game";

   export interface GameTemplate {
     variables: Variable[];
     actions: ActionPermission[];  // 権限キーの配列に変更
     layoutMode?: LayoutMode;
     maxPlayers?: number;
     potEnabled?: boolean;
   }
   ```

2. **テンプレートの更新** (`app/utils/roomUtils.ts`)
   ```typescript
   actions: ["transfer_score", "retrieve_pot", "finalize_game"]
   ```

**対象ファイル:**
- `app/types/index.ts`
- `app/utils/roomUtils.ts`

**完了条件:**
- [ ] 型定義が権限キー形式に変更されている
- [ ] テンプレートが新形式で定義されている
- [ ] 新規ルーム作成時に権限リストが保存される

---

### Task 3: アクション履歴とタイムトラベル機能

**目的:**
全操作のステート履歴を保持し、任意の時点への復元（Time Travel）を可能にする。

#### 3-1: データモデル拡張

**型定義の追加** (`app/types/index.ts`)

```typescript
// 履歴エントリ
export interface HistoryEntry {
  id: string;           // UUID
  timestamp: number;    // Unix timestamp
  message: string;      // ログ表示用 (例: "UserA → Pot: 1000")
  snapshot: GameStateSnapshot;  // その時点のステート（history自体は除く）
}

// スナップショット（historyを除いたGameState）
export type GameStateSnapshot = Omit<GameState, 'history'> & {
  __pot__?: PotState;
  [userId: string]: PlayerState;
};

// GameStateの拡張
export type GameState = {
  __pot__?: PotState;
  history?: HistoryEntry[];  // 履歴配列（時系列順）
} & {
  [userId: string]: PlayerState;
};
```

#### 3-2: API実装

**A. スナップショット保存ロジック** (`app/lib/roomApi.ts`)

`transferScore` 等の更新処理に追加:

```typescript
// 1. 現在のcurrent_stateからhistoryを除いたコピーを作成
const { history, ...snapshot } = currentState;

// 2. 新しい履歴エントリを作成
const newEntry: HistoryEntry = {
  id: generateUUID(),
  timestamp: Date.now(),
  message: `${fromName} → ${toName}: ${amount}`,
  snapshot: snapshot as GameStateSnapshot,
};

// 3. history配列の末尾に追加
const updatedHistory = [...(history || []), newEntry];

// 4. 点数移動計算後、current_stateを保存
const newState = {
  ...calculatedState,
  history: updatedHistory,
};
```

**B. rollbackTo API** (`app/lib/roomApi.ts`)

```typescript
export async function rollbackTo(
  roomId: string,
  historyId: string
): Promise<{ error: Error | null }> {
  // 1. 最新のroom情報を取得
  // 2. history配列から指定されたhistoryIdを探す
  // 3. 見つかった要素のsnapshotを展開
  // 4. ロールバック地点より「未来」の履歴を削除
  // 5. 新しいcurrent_stateをDBに保存
}
```

#### 3-3: UI実装

**履歴画面コンポーネント** (`app/components/game/HistoryLog.tsx`)

```
┌─────────────────────────────────────┐
│           操作履歴                  │
├─────────────────────────────────────┤
│ 12:34:56  UserA → Pot: 1000   [取消] │  ← 最新
│ 12:34:45  UserB → UserA: 3000 [復元] │
│ 12:34:30  UserC → Pot: 1000   [復元] │
│ 12:34:15  ゲーム開始           [復元] │
│ ...                                 │
└─────────────────────────────────────┘
```

- 一覧表示: history配列を「新しい順」に表示
- 最新のログ: 「取消（Undo）」ボタン
- 過去のログ: 「この時点に復元」ボタン
- タップで確認ダイアログ → rollbackTo実行

**対象ファイル:**
- `app/types/index.ts` - 型定義追加
- `app/lib/roomApi.ts` - スナップショット保存、rollbackTo API
- 新規: `app/components/game/HistoryLog.tsx` - 履歴画面
- `app/app/game/[id].tsx` - 履歴画面へのナビゲーション

**完了条件:**
- [ ] transferScore実行時にhistory配列にスナップショットが追加される
- [ ] 履歴一覧画面が表示される
- [ ] 「取消」で直前の状態に戻れる
- [ ] 「復元」で任意の時点に戻れる
- [ ] 復元後、未来の履歴が削除されている

---

### Task 4: 動作確認

**確認項目:**

1. **点数移動**
   - [ ] ドラッグ&ドロップで送金が動作
   - [ ] Pot への供託・回収が動作
   - [ ] 操作ごとに履歴が記録される

2. **タイムトラベル**
   - [ ] 履歴一覧が表示される
   - [ ] Undoで直前に戻れる
   - [ ] 任意の時点に復元できる
   - [ ] 復元後も正常に操作継続できる

3. **座席システム**
   - [ ] 3人でも2人でも正常動作
   - [ ] 空席があっても問題なし

4. **リアルタイム同期**
   - [ ] 操作・復元が他デバイスに即座に反映

---

## 実装順序

```
Step 1: Task 1 - ActionButtons削除 (15分)
    ↓
Step 2: Task 2 - actions権限リスト化 (30分)
    ↓
Step 3: Task 3 - タイムトラベル機能 (2-3時間)
    ├── 3-1: 型定義拡張
    ├── 3-2: API実装（スナップショット保存、rollbackTo）
    └── 3-3: UI実装（履歴画面）
    ↓
Step 4: Task 4 - 動作確認 (30分)
    ↓
Phase 3 完了
```

---

## 変更しないもの

| 項目 | 理由 |
|------|------|
| ドラッグ&ドロップ機能 | そのまま使用 |
| PaymentModal | そのまま使用 |
| 座席システム | 空席許容で対応済み |
| transferScore API | 履歴保存ロジックを追加するのみ |

---

## Phase 4 以降（将来）

| Phase | 内容 |
|-------|------|
| Phase 4 | 精算画面（`finalize_game` 権限を使用） |
| Phase 5 | QRコード機能 |
| Phase 6+ | UI/UX改善、オフライン対応、テスト、デプロイ |

---

**最終更新:** 2026-01-27
