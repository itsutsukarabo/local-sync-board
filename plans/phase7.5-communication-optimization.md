# Phase 7.5: 通信最適化

## ステータス: 計画策定済み
## 前提: Phase 7.1〜7.4 完了済み

---

## 背景

Phase 7.3（データ正規化）で `current_state` から履歴・精算データを分離し、Phase 7.4（RPC化）で原子的更新に移行した。これにより Realtime ペイロードのサイズは大幅に縮小されたが、以下の非効率が残っている:

1. **操作元クライアントの二重 refetch** — 手動 `await refetch()` + Realtime トリガーで2回取得
2. **Realtime ペイロードの未活用** — `new_record` を捨てて毎回 REST API で全件取得
3. **全クライアントが一斉 refetch** — 5人同時プレイ時に1操作で5回の REST API コール

---

## 改善項目

### 7.5.1: Realtime ペイロードの直接適用（REST refetch の削減）

**現状:**
```
Realtime UPDATE イベント受信 → payload 破棄 → REST API で rooms 全体を再取得
```

**改善後:**
```
Realtime UPDATE イベント受信 → payload.new の room データを直接 setRoom() に適用
```

**変更ファイル:** `app/hooks/useRoomRealtime.ts`

**実装方針:**
```typescript
.on("postgres_changes", {
  event: "UPDATE",
  schema: "public",
  table: "rooms",
  filter: `id=eq.${roomId}`,
}, (payload) => {
  // payload.new に更新後の room データが含まれる
  if (payload.new && payload.new.id === roomId) {
    setRoom(payload.new as Room);
    // refetch 不要 — Realtime ペイロードが最新データ
  }
})
```

**注意点:**
- Supabase Realtime の `postgres_changes` は `new` に完全な行データを含む（`replica identity full` の場合）
- デフォルトの `replica identity default` では主キー以外のカラムは `old` に含まれない場合がある
- `new` にはUPDATE後の全カラムが含まれるため、`current_state` を含む完全な Room データが取得可能
- 万が一 `payload.new` が不完全な場合のフォールバックとして refetch を残す

**フォールバック設計:**
```typescript
.on("postgres_changes", { event: "UPDATE", ... }, (payload) => {
  const newRoom = payload.new;
  if (newRoom && newRoom.current_state && newRoom.template) {
    // ペイロードが完全 → 直接適用
    setRoom(newRoom as Room);
  } else {
    // ペイロードが不完全 → 従来通り refetch
    refetchRef.current();
  }
})
```

**効果:**
- 観測クライアント（操作していない側）の REST API コールが **0回** になる
- 5人プレイ時: 1操作あたり REST コール 5回 → 1回（操作元のみ）に削減

---

### 7.5.2: 操作元クライアントの二重 refetch 防止

**現状:**
```
操作元クライアント:
  1. await transferScore()    ← RPC 実行
  2. await refetch()          ← 手動 refetch（1回目）
  3. Realtime UPDATE 受信     ← 自動 refetch（2回目）
```

**改善方針A: 手動 refetch を廃止し、Realtime ペイロード適用に統一**

7.5.1 で Realtime ペイロードを直接適用する場合、操作元の手動 refetch も不要になる。
ただし RPC 完了〜Realtime 受信までのラグ（通常 50〜200ms）の間、UI が古い状態のままになる。

**改善方針B（推奨）: 手動 refetch を維持し、Realtime 側を抑制**

操作直後に「最近 refetch した」フラグを立て、Realtime イベントによる重複更新を防ぐ:

```typescript
const lastRefetchTime = useRef<number>(0);
const REFETCH_COOLDOWN_MS = 500;

// 手動 refetch（操作後に呼ぶ）
const manualRefetch = useCallback(async () => {
  await refetch();
  lastRefetchTime.current = Date.now();
}, [refetch]);

// Realtime コールバック
.on("postgres_changes", { event: "UPDATE", ... }, (payload) => {
  const elapsed = Date.now() - lastRefetchTime.current;
  if (elapsed < REFETCH_COOLDOWN_MS) {
    // 直近に手動 refetch 済み → スキップ
    return;
  }
  // ペイロード直接適用 or refetch
  if (payload.new?.current_state) {
    setRoom(payload.new as Room);
  } else {
    refetchRef.current();
  }
})
```

**変更箇所:**
- `app/hooks/useRoomRealtime.ts`: クールダウン付き Realtime ハンドラ
- `app/app/game/[id].tsx`: 各操作後の `await refetch()` はそのまま維持

**効果:**
- 操作元クライアントの refetch が 2回 → 1回 に削減
- Realtime イベント処理のオーバーヘッドも軽減

---

### 7.5.3: ゲーム画面の refetch 呼び出し整理

**現状:** `[id].tsx` 内に `await refetch()` が **12箇所** に散在。

**対象の分類:**

| 関数 | 現在の refetch | 改善後 |
|------|---------------|--------|
| `handleTransfer` | `await refetch()` | RPC完了後、Realtime で自動反映されるため **削除可** |
| `handleRollback` | `await refetch()` | 同上 |
| `handleUndo` | `await refetch()` | 同上 |
| `handleSettlement` | `await refetch()` | 同上 |
| `handleJoinSeat` | `await refetch()` | seats 変更は Realtime で反映 → **削除可** |
| `handleLeaveSeat` | `await refetch()` | 同上 |
| `handleJoinFakeSeat` | `await refetch()` | 同上 |
| `handleRemoveFakePlayer` | `await refetch()` | 同上 |
| `handleReseatFakePlayer` | `await refetch()` | 同上 |
| `handleTemplateUpdate` | `await refetch()` | 同上 |
| `handleStatusChange` | `await refetch()` | 同上 |

**改善方針:**
- 7.5.1（ペイロード直接適用）が安定動作すれば、**全ての手動 refetch を削除可能**
- 段階的に進める: まず RPC 系の7関数（transferScore 等）から手動 refetch を削除し、動作確認
- 問題がなければ残りの関数からも削除

**リスク軽減:**
- 手動 refetch 削除後も、Realtime 受信までの 50〜200ms は古いデータが表示される
- ユーザー体感上の問題がある場合は、RPC の戻り値に更新後の `current_state` を含めて即時反映する方式も検討

---

## 実装順序

```
Step 1: 7.5.1 — Realtime ペイロード直接適用
         useRoomRealtime.ts の Realtime コールバック修正
         フォールバック付きで安全に導入

Step 2: 7.5.2 — 二重 refetch 防止
         クールダウン機構の追加
         動作確認

Step 3: 7.5.3 — 手動 refetch の段階的削除
         RPC 系関数から開始
         問題なければ全関数に展開
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `app/hooks/useRoomRealtime.ts` | Realtime ペイロード直接適用、クールダウン機構 |
| `app/app/game/[id].tsx` | 手動 refetch の削除（段階的） |

---

## 効果見積もり（5人プレイ・1操作あたり）

| 指標 | 現状 | 改善後 |
|------|------|--------|
| REST API コール数 | 6回（操作元2回 + 他4人×1回） | 0〜1回 |
| Realtime ペイロード | 通知のみ（データ未活用） | データ直接適用 |
| 操作→他クライアント反映 | ~500ms（refetch待ち） | ~100ms（Realtime直接） |
| 操作元の UI 更新 | ~300ms（REST refetch） | ~100ms（Realtime直接） |

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| Realtime ペイロードが不完全 | フォールバックで refetch を実行 |
| Realtime 切断時にデータが古くなる | Phase 7.2 の接続監視バナーで通知済み。再接続時に refetch |
| ペイロード直接適用で型不一致 | `as Room` キャスト前に必須フィールドの存在チェック |
| 手動 refetch 削除後の UI ラグ | 段階的に削除し、体感上の問題があれば rollback |
