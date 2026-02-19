# 再発防止テスト追加計画

過去の `fix:` コミットを分析し、テストが存在しないクリティカルなバグを特定した。
この計画に従ってテストを追加し、再発を防止する。

## 背景・分析元

git log の全 `fix:` コミット（約30件）を分析。
フロントエンドロジックに関わるものの中で、**既存テストでカバーされていないもの**を以下に絞り込んだ。

---

## 追加対象テスト（5件）

### T1 — `settlementUtils` 純粋関数ユニットテスト（新規ファイル）

**対応コミット:** `ce44705` 精算バリデーションで供託金を合計に含めず、Pot残高0を必須条件に変更

**ファイル:** `tests/hooks/settlementUtils.test.ts`（新規作成）
**環境:** `// @vitest-environment jsdom` 不要（純粋関数）
**対象関数:** `app/utils/settlementUtils.ts` の `canExecuteSettlement` と `executeSettlement`

**追加すべきテストケース:**

```
canExecuteSettlement
├── Pot残高が残っている場合は canExecute: false（reason に「供託金」含む）
├── Pot自体は合計チェックに含まれない（Pot残高があっても着席者合計は正しい）
├── 着席者2人未満は canExecute: false
├── 合計点が不一致は canExecute: false（初期値×人数と異なる場合）
├── 同点プレイヤーがいる場合は canExecute: false
└── 全条件クリアで canExecute: true

executeSettlement
├── score降順でランク付けされる
├── 最下位の result が -(上位合計) で端数調整される
└── playerResults に全着席者が含まれる
```

**補足:** 現在 `useGameActions.test.ts` では `canExecuteSettlement` が完全にモックされており、
実ロジックがテストされていない。このファイルで初めて実ロジックをカバーする。

---

### T2 — reseatFakePlayer 後の displayName 検証（既存ファイルへ追記）

**対応コミット:** `a1d7716` ゲスト再着席時に displayName が ID になる不具合を修正

**ファイル:** `tests/api/roomApi.scenario.test.ts`
**場所:** 既存シナリオ「架空プレイヤー追加→席移動→削除」の step 3（reseat後）

**現状の検証（line 289-292）:**
```typescript
expect(dbAfterReseat!.seats[1].userId).toBe(fakeId);
expect(dbAfterReseat!.seats[1].isFake).toBe(true);
// ← ここに displayName の検証がない
```

**追加すべきアサーション:**
```typescript
// reseat 後も displayName が元のゲスト名（IDではない）であること
expect(dbAfterReseat!.seats[1].displayName).toBe(seat0.displayName);
expect(dbAfterReseat!.seats[1].displayName).not.toMatch(/^fake_/);
```

---

### T3 — 離席中ゲストがいる状態での新規ゲスト名重複防止（既存ファイルへ追記）

**対応コミット:** `554a8f3` ゲスト新規作成時に既存ゲストと衝突する不具合を修正

**ファイル:** `tests/api/roomApi.scenario.test.ts`
**場所:** 既存シナリオ「架空プレイヤー追加→席移動→削除」に新ステップとして追記
（または別の `describe` ブロックとして追加）

**テストシナリオ:**
1. ゲストAを席0に追加（displayName = "プレイヤーA"）
2. 席0を手動で空ける（ゲストAは current_state に残存、seats からは除去）
3. 新規ゲストを席0に追加
4. → 新規ゲストの displayName が "プレイヤーB" であること（"プレイヤーA"でないこと）

**追加すべきアサーション:**
```typescript
const newSeat = dbAfterSecondFake!.seats[0];
expect(newSeat.displayName).toBe("プレイヤーB");   // Aと衝突しない
expect(newSeat.displayName).not.toBe("プレイヤーA"); // 離席中Aと重複しない
```

---

### T4 — handleTransfer: fromId === toId の自己転送ガード

**対応コミット:** `7f4b133` Pot自身→自身へのドラッグアクションを防止

**ファイル:** `tests/hooks/useGameActions.test.ts`
**場所:** 既存 `describe("handleTransfer")` ブロックに追記

**追加すべきテストケース:**
```typescript
it("fromId と toId が同じ場合は transferScore が呼ばれない", async () => {
  const { result } = renderHook(() => useGameActions(defaultParams()));

  await act(async () => {
    await result.current.handleTransfer(
      "user-1",
      "user-1",  // 自己転送
      [{ variable: "score", amount: 1000 }]
    );
  });

  expect(mockTransferScore).not.toHaveBeenCalled();
});
```

**注意:** 現在の `useGameActions.ts` に fromId === toId のガードがあるか確認すること。
もしガードがなければ**実装コードにも追加が必要**（テストを先に書いてから実装）。

---

### T5 — handleTransfer: 席が入れ替わった後も現在の userId で displayName を解決する

**対応コミット:** `1dd793b` 離席後に同じ席へ着席したプレイヤーへの支払いが誤送先になるバグを修正

**ファイル:** `tests/hooks/useGameActions.test.ts`
**場所:** 既存 `describe("handleTransfer")` ブロックに追記

**テストシナリオ:**
- 元の room.seats: `[{ userId: "user-old", displayName: "旧プレイヤー" }, ...]`
- 更新後の room.seats: `[{ userId: "user-new", displayName: "新プレイヤー" }, ...]`（同じ席番号に別ユーザー）
- `handleTransfer("user-new", "user-2", ...)` を呼ぶ
- → `transferScore` に渡される `fromName` が「新プレイヤー」であること

**追加すべきテストケース:**
```typescript
it("席の userId が変わった後も現在の seats から displayName を正しく取得する", async () => {
  mockTransferScore.mockResolvedValue({ error: null });

  // 席0に user-new が着席している room
  const roomWithNewPlayer = makeRoom({
    seats: [
      { userId: "user-new", status: "active", displayName: "新プレイヤー" },
      { userId: "user-2",   status: "active", displayName: "Player2" },
      null,
      null,
    ],
    current_state: {
      "user-new": { score: 25000 },
      "user-2":   { score: 25000 },
    },
  });
  const params = { ...defaultParams(), room: roomWithNewPlayer };
  const { result } = renderHook(() => useGameActions(params));

  await act(async () => {
    await result.current.handleTransfer(
      "user-new",
      "user-2",
      [{ variable: "score", amount: 1000 }]
    );
  });

  expect(mockTransferScore).toHaveBeenCalledWith(
    "room-1",
    "user-new",
    "user-2",
    [{ variable: "score", amount: 1000 }],
    "新プレイヤー",  // 旧プレイヤー名ではない
    "Player2"
  );
});
```

---

## 実装手順

```
1. tests/hooks/settlementUtils.test.ts を新規作成（T1）
   - import { canExecuteSettlement, executeSettlement } from "../../app/utils/settlementUtils"
   - 外部依存なし・モック不要

2. tests/api/roomApi.scenario.test.ts に T2・T3 を追記
   - T2: 既存 reseat ステップに expect 2行を追加するだけ
   - T3: 新規 it ブロックを追加（または既存シナリオを拡張）

3. tests/hooks/useGameActions.test.ts に T4・T5 を追記
   - T4: handleTransfer describe 内に it 1件追加
   - T5: handleTransfer describe 内に it 1件追加
   - T4 で実装コードにガードがなければ useGameActions.ts も修正

4. npm test で全テストが green であることを確認
5. cd app && npx tsc --noEmit で型エラー 0 を確認
```

---

## ファイルパス早見表

| ファイル | 役割 |
|---------|------|
| `app/utils/settlementUtils.ts` | 精算純粋関数（canExecuteSettlement, executeSettlement） |
| `app/hooks/useGameActions.ts` | ゲーム操作ハンドラフック（handleTransfer等） |
| `app/lib/roomApi.ts` | Supabase操作API（joinFakeSeat, reseatFakePlayer等） |
| `tests/hooks/settlementUtils.test.ts` | **新規** T1 |
| `tests/hooks/useGameActions.test.ts` | 既存 T4・T5 追記 |
| `tests/api/roomApi.scenario.test.ts` | 既存 T2・T3 追記 |

---

## 優先度

| 優先 | タスク | 理由 |
|------|--------|------|
| 🔴 最高 | T1 settlementUtils テスト | 純粋関数・依存なし・再発リスク最大 |
| 🔴 高 | T2 displayName 検証追加 | 2行追加で完了 |
| 🔴 高 | T3 ゲスト名重複防止テスト | 実際のバグが残りやすい箇所 |
| 🟡 中 | T4 自己転送ガード | 実装修正が必要な可能性あり |
| 🟡 中 | T5 席入れ替え後の displayName | 既存ロジック確認が必要 |
