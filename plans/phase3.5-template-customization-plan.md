# Phase 3.5: テンプレートカスタマイズ機能 - 実装計画

**作成日:** 2026-01-29
**ステータス:** 計画中

---

## 概要

麻雀モードの変数や拡張等を将来自由にカスタマイズできるようにし、実際にHostにカスタマイズさせる機能を追加する。

---

## 要件一覧

| # | 要件 | 詳細 |
|---|------|------|
| ① | riichi変数削除 | デフォルトテンプレートからriichi変数を削除 |
| ② | variables追加 | hostがゲーム中に変数を追加可能（任意のタイミング） |
| ③ | pot操作カスタマイズ | 入れる変数と量を設定可能。複数定義し選択可能。1つの場合は選択モーダル非表示 |
| ④ | permissions主語明確化 | hostPermissions / playerPermissions に分離（ロールベース） |
| ⑤ | host強制操作 | hostが任意プレイヤーのスコアを別画面で一括編集 |
| ⑥ | スコアリセット | どのvariableをリセットするか選択可能。関連する供託金もリセット。履歴は保持 |
| ⑦ | 初期値変更 | 任意のモードで各variablesの初期値をhostが変更可能 |

---

## データモデル設計

### 型定義の変更 (`app/types/index.ts`)

```typescript
/**
 * レイアウトモード
 */
export type LayoutMode = "list" | "mahjong";

/**
 * 権限キー定義（拡張版）
 */
export type PermissionKey =
  | "transfer_score"    // スコア移動（プレイヤー間）
  | "retrieve_pot"      // 供託回収
  | "finalize_game"     // ゲーム終了・精算
  | "force_edit"        // 強制編集（他プレイヤーのスコア操作）
  | "reset_scores"      // スコアリセット
  | "edit_template";    // テンプレート編集（変数追加、初期値変更等）

/**
 * 変数定義
 */
export interface Variable {
  key: string;
  label: string;
  initial: number;
}

/**
 * Pot操作定義
 */
export interface PotAction {
  id: string;           // 一意のID
  label: string;        // 表示名（例: "リーチ"）
  variable: string;     // 対象の変数キー（例: "score"）
  amount: number;       // 移動量（例: 1000）
}

/**
 * ゲームテンプレート定義（拡張版）
 */
export interface GameTemplate {
  variables: Variable[];
  layoutMode?: LayoutMode;
  maxPlayers?: number;
  potEnabled?: boolean;
  potActions?: PotAction[];           // Pot操作の定義リスト
  hostPermissions: PermissionKey[];   // ホストの権限
  playerPermissions: PermissionKey[]; // プレイヤーの権限
}

/**
 * 供託金状態
 */
export interface PotState {
  [variableKey: string]: number;  // 各変数ごとの供託金
}

// 後方互換性のため、score専用のアクセサも用意
// pot.score または pot["score"] でアクセス可能
```

### 更新後のデフォルトテンプレート

#### 麻雀テンプレート

```json
{
  "variables": [
    { "key": "score", "label": "点数", "initial": 25000 }
  ],
  "layoutMode": "mahjong",
  "maxPlayers": 4,
  "potEnabled": true,
  "potActions": [
    { "id": "riichi", "label": "リーチ", "variable": "score", "amount": 1000 }
  ],
  "hostPermissions": [
    "transfer_score",
    "retrieve_pot",
    "finalize_game",
    "force_edit",
    "reset_scores",
    "edit_template"
  ],
  "playerPermissions": [
    "transfer_score",
    "retrieve_pot"
  ]
}
```

#### シンプルスコアテンプレート

```json
{
  "variables": [
    { "key": "score", "label": "スコア", "initial": 0 }
  ],
  "layoutMode": "list",
  "potEnabled": false,
  "potActions": [],
  "hostPermissions": [
    "transfer_score",
    "finalize_game",
    "force_edit",
    "reset_scores",
    "edit_template"
  ],
  "playerPermissions": [
    "transfer_score"
  ]
}
```

---

## タスク分割

### Task 3.5-1: データモデル更新 + riichi削除

**目的:** 型定義の更新とデフォルトテンプレートの修正

**対象ファイル:**
- `app/types/index.ts`
- `app/utils/roomUtils.ts`

**作業内容:**
1. `PermissionKey`型を拡張
2. `PotAction`型を追加
3. `GameTemplate`型を更新（hostPermissions/playerPermissions）
4. `PotState`型を更新（変数ごとの供託金対応）
5. `TEMPLATE_PRESETS`からriichi変数を削除
6. potActionsをデフォルトテンプレートに追加

**完了条件:**
- [ ] 型定義が更新されている
- [ ] TypeScriptエラーがない
- [ ] 新規ルーム作成時に新形式のテンプレートが保存される

---

### Task 3.5-2: potActions実装（選択モーダル含む）

**目的:** 複数のPot操作を定義し、選択できるようにする

**対象ファイル:**
- `app/components/game/MahjongTable.tsx`
- 新規: `app/components/game/PotActionSelectModal.tsx`

**作業内容:**
1. `PotActionSelectModal`コンポーネントを作成
   - potActionsが1つの場合：モーダル非表示で即座に実行
   - potActionsが複数の場合：選択モーダルを表示
2. `MahjongTable`のドロップ処理を更新
3. `PotArea`をドラッグ元として機能させる（供託回収用）

**UI設計:**
```
┌─────────────────────────────────┐
│       供託に入れる操作を選択      │
├─────────────────────────────────┤
│  [ リーチ (-1000点) ]           │
│  [ 供託 (-300点) ]              │
│  [ キャンセル ]                 │
└─────────────────────────────────┘
```

**完了条件:**
- [ ] potActionsが1つの場合、即座に実行される
- [ ] potActionsが複数の場合、選択モーダルが表示される
- [ ] 選択した操作が正しく実行される

---

### Task 3.5-3: Host管理画面の骨組み作成

**目的:** ホスト専用の設定画面を作成

**対象ファイル:**
- 新規: `app/app/game/settings/[id].tsx`
- `app/app/game/[id].tsx`（設定ボタンからの遷移追加）

**作業内容:**
1. 新しい画面ファイルを作成
2. 基本的なレイアウトを実装
3. ゲーム画面の⚙️ボタンから遷移できるようにする
4. 各セクションのプレースホルダーを配置

**UI設計:**
```
┌─────────────────────────────────────┐
│  ← 戻る    ルーム設定              │
├─────────────────────────────────────┤
│                                     │
│  📊 変数設定                        │
│  └─ (Task 3.5-4で実装)             │
│                                     │
│  💰 供託操作                        │
│  └─ (Task 3.5-4で実装)             │
│                                     │
│  👥 プレイヤー管理                  │
│  └─ (Task 3.5-6で実装)             │
│                                     │
│  🔄 リセット                        │
│  └─ (Task 3.5-7で実装)             │
│                                     │
└─────────────────────────────────────┘
```

**完了条件:**
- [ ] 設定画面に遷移できる
- [ ] 戻るボタンでゲーム画面に戻れる
- [ ] ホスト以外はアクセスできない（またはread-only）

---

### Task 3.5-4: 変数追加・Pot操作編集UI

**目的:** ② 変数追加 + ③ Pot操作編集のUI実装

**対象ファイル:**
- `app/app/game/settings/[id].tsx`
- 新規: `app/components/settings/VariableEditor.tsx`
- 新規: `app/components/settings/PotActionEditor.tsx`

**作業内容:**

**変数設定セクション:**
```
┌─────────────────────────────────┐
│ 📊 変数設定                     │
├─────────────────────────────────┤
│ キー: score                     │
│ 表示名: [点数        ]          │
│ 初期値: [25000      ]  [削除]   │
├─────────────────────────────────┤
│ [+ 変数を追加]                  │
└─────────────────────────────────┘
```

**供託操作セクション:**
```
┌─────────────────────────────────┐
│ 💰 供託操作                     │
├─────────────────────────────────┤
│ 表示名: [リーチ     ]           │
│ 変数: [score ▼] 量: [1000]      │
│                        [削除]   │
├─────────────────────────────────┤
│ [+ 操作を追加]                  │
└─────────────────────────────────┘
```

**完了条件:**
- [ ] 変数の追加ができる
- [ ] 変数の表示名・初期値を変更できる
- [ ] 変数の削除ができる（使用中は警告）
- [ ] Pot操作の追加・編集・削除ができる

---

### Task 3.5-5: 初期値変更UI

**目的:** ⑦ 各variablesの初期値をhostが変更可能にする

**対象ファイル:**
- Task 3.5-4に含む（変数設定セクション内）

**作業内容:**
1. 初期値の入力フィールドを実装
2. 変更時にテンプレートを更新
3. 注意：既存プレイヤーのスコアは変更されない（新規参加者のみ適用）

**完了条件:**
- [ ] 初期値を変更できる
- [ ] 変更が保存される
- [ ] 新規参加者に新しい初期値が適用される

---

### Task 3.5-6: 強制スコア編集UI

**目的:** ⑤ hostが任意プレイヤーのスコアを編集可能にする

**対象ファイル:**
- `app/app/game/settings/[id].tsx`
- 新規: `app/components/settings/PlayerScoreEditor.tsx`

**作業内容:**
```
┌─────────────────────────────────┐
│ 👥 プレイヤー管理               │
├─────────────────────────────────┤
│ Player1 (あなた)                │
│   点数: [24000      ]  [更新]   │
├─────────────────────────────────┤
│ Player2                         │
│   点数: [26000      ]  [更新]   │
├─────────────────────────────────┤
│ Player3                         │
│   点数: [25000      ]  [更新]   │
└─────────────────────────────────┘
```

**完了条件:**
- [ ] 全プレイヤーのスコアが一覧表示される
- [ ] 各プレイヤーのスコアを個別に編集できる
- [ ] 変更が即座に反映される
- [ ] 変更が履歴に記録される

---

### Task 3.5-7: リセット機能UI

**目的:** ⑥ 全員のスコアをリセットする機能

**対象ファイル:**
- `app/app/game/settings/[id].tsx`
- 新規: `app/components/settings/ResetSection.tsx`

**作業内容:**
```
┌─────────────────────────────────┐
│ 🔄 リセット                     │
├─────────────────────────────────┤
│ リセットする変数を選択:         │
│ [✓] 点数 → 25000に戻す         │
│ [ ] その他の変数（あれば）      │
│                                 │
│ ⚠️ 選択した変数に関連する       │
│   供託金もリセットされます      │
│                                 │
│ [リセット実行]                  │
└─────────────────────────────────┘
```

**完了条件:**
- [ ] リセットする変数を選択できる
- [ ] 選択した変数が全プレイヤーで初期値に戻る
- [ ] 関連する供託金もリセットされる
- [ ] 履歴は保持される
- [ ] リセット操作自体が履歴に記録される

---

### Task 3.5-8: API実装

**目的:** バックエンドAPIの実装

**対象ファイル:**
- `app/lib/roomApi.ts`

**追加するAPI:**

```typescript
/**
 * テンプレートを更新（変数追加、初期値変更、Pot操作編集）
 */
export async function updateTemplate(
  roomId: string,
  template: Partial<GameTemplate>
): Promise<{ error: Error | null }>;

/**
 * プレイヤーのスコアを強制編集
 */
export async function forceEditScore(
  roomId: string,
  playerId: string,
  updates: Record<string, number>
): Promise<{ error: Error | null }>;

/**
 * 指定した変数をリセット
 */
export async function resetScores(
  roomId: string,
  variableKeys: string[]
): Promise<{ error: Error | null }>;
```

**完了条件:**
- [ ] updateTemplate APIが動作する
- [ ] forceEditScore APIが動作する（履歴記録あり）
- [ ] resetScores APIが動作する（履歴記録あり、供託リセット含む）

---

## 実装順序

```
Task 3.5-1: データモデル更新 + riichi削除
    ↓
Task 3.5-2: potActions実装（選択モーダル）
    ↓
Task 3.5-3: Host管理画面の骨組み
    ↓
Task 3.5-4: 変数追加・Pot操作編集UI
Task 3.5-5: 初期値変更UI（3.5-4に含む）
    ↓
Task 3.5-6: 強制スコア編集UI
    ↓
Task 3.5-7: リセット機能UI
    ↓
Task 3.5-8: API実装（各タスクと並行して実装可能）
    ↓
動作確認・テスト
```

---

## 権限チェックの実装方針

### フロントエンド

```typescript
// 権限チェックユーティリティ
function hasPermission(
  template: GameTemplate,
  permission: PermissionKey,
  isHost: boolean
): boolean {
  if (isHost) {
    return template.hostPermissions.includes(permission);
  }
  return template.playerPermissions.includes(permission);
}

// 使用例
if (hasPermission(room.template, "force_edit", isHost)) {
  // 強制編集ボタンを表示
}
```

### 管理画面へのアクセス制御

```typescript
// game/settings/[id].tsx
if (!isHost) {
  return (
    <View>
      <Text>この画面はホストのみアクセスできます</Text>
      <Button onPress={() => router.back()}>戻る</Button>
    </View>
  );
}
```

---

## 既存コードへの影響

### 影響を受けるファイル

| ファイル | 変更内容 |
|----------|----------|
| `app/types/index.ts` | 型定義の追加・変更 |
| `app/utils/roomUtils.ts` | テンプレートプリセットの更新 |
| `app/lib/roomApi.ts` | 新規API追加、transferScore更新 |
| `app/components/game/MahjongTable.tsx` | potActions対応 |
| `app/components/game/PotArea.tsx` | ドラッグ対応の確認 |
| `app/app/game/[id].tsx` | 設定画面への遷移追加 |

### 後方互換性

- 既存のルームデータは新形式に移行が必要
- `permissions`配列 → `hostPermissions` + `playerPermissions`への変換
- マイグレーション関数を用意する

```typescript
function migrateTemplate(oldTemplate: any): GameTemplate {
  // 旧形式のpermissionsを新形式に変換
  if (oldTemplate.permissions && !oldTemplate.hostPermissions) {
    return {
      ...oldTemplate,
      hostPermissions: oldTemplate.permissions,
      playerPermissions: oldTemplate.permissions.filter(
        (p: string) => p !== "finalize_game"
      ),
      potActions: oldTemplate.potActions || [
        { id: "default", label: "供託", variable: "score", amount: 1000 }
      ],
    };
  }
  return oldTemplate;
}
```

---

## テストシナリオ

### シナリオ1: 変数追加

1. ホストが管理画面を開く
2. 「変数を追加」をタップ
3. キー: "bonus"、表示名: "ボーナス"、初期値: 0 を入力
4. 保存
5. 新規参加者にbonus変数が追加されている

### シナリオ2: Pot操作選択

1. potActionsに2つの操作を追加（リーチ1000、供託300）
2. プレイヤーが自分→Potにドラッグ
3. 選択モーダルが表示される
4. 「リーチ」を選択
5. 1000点が供託に移動

### シナリオ3: 強制スコア編集

1. ホストが管理画面を開く
2. プレイヤー管理セクションで特定プレイヤーのスコアを変更
3. 「更新」をタップ
4. 全員の画面でスコアが更新される
5. 履歴に「ホストによる編集」として記録される

### シナリオ4: リセット

1. ホストが管理画面を開く
2. リセットセクションで「点数」にチェック
3. 「リセット実行」をタップ
4. 確認ダイアログが表示される
5. 全員のスコアが25000に戻る
6. 供託金もリセットされる
7. 履歴に「スコアリセット」として記録される

---

## 次のステップ

Phase 3.5完了後:
- Phase 4: 精算画面（`finalize_game`権限を使用）
- Phase 5: QRコード機能

---

**最終更新:** 2026-01-29
