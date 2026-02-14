# Phase 7: Realtime/API 通信の抜本的改善計画

## 調査日: 2026-02-15
## ステータス: 調査完了・計画案

---

## STEP 0: 通信ライフサイクルの整理とルール策定

### 0-1. 現状のデータフロー分析

現在のアーキテクチャは以下の構成:

```
[クライアントA]                  [Supabase]                   [クライアントB]
     |                              |                              |
     |-- (1) API呼び出し ---------->|                              |
     |   (roomApi.ts の各関数)      |                              |
     |                              |-- (2) DB UPDATE ------------>|
     |                              |                              |
     |                              |-- (3) Realtime Push -------->|
     |                              |       (postgres_changes)     |
     |                              |                              |
     |                              |<--- (4) refetch -------------|
     |<-- (5) refetch (自発) ------>|       (useRoomRealtime)      |
     |                              |                              |
```

**通信の流れ:**
1. クライアントAが `roomApi.ts` の関数（例: `transferScore`）を呼び出し
2. Supabase の `rooms` テーブルの `current_state` (JSONB) を UPDATE
3. Supabase Realtime が `postgres_changes` イベントを全購読者にPush
4. クライアントBの `useRoomRealtime` が UPDATE イベントを受信 → `refetch()` を実行
5. クライアントAも操作後に `await refetch()` を自発的に呼び出し

### 0-2. 発見された構造的問題

#### 問題1: 「単一巨大JSONBカラム」アンチパターン（最重要）

`rooms.current_state` に以下の**全て**が格納されている:

```json
{
  "user-uuid-1": { "score": 25000, "__displayName__": "太郎" },
  "user-uuid-2": { "score": 30000, "__displayName__": "花子" },
  "__pot__": { "score": 1000 },
  "__history__": [
    { "id": "...", "timestamp": ..., "message": "...", "snapshot": { /* 全プレイヤーの全データのコピー */ } },
    { "id": "...", "timestamp": ..., "message": "...", "snapshot": { /* 全プレイヤーの全データのコピー */ } },
    // ... 数十〜数百エントリ、各エントリに全体スナップショット
  ],
  "__settlements__": [ /* 精算履歴 */ ],
  "__writeId__": "..."
}
```

**致命的な問題:**
- 履歴(`__history__`)が**操作ごとに全プレイヤーのスナップショット**を保持するため、O(操作数 × プレイヤー数 × 変数数) でデータ量が爆発的に増加
- 5人×数時間プレイ → 数百回の操作 → 各操作に5人分のスナップショット → **current_state が数MB以上に膨張**
- **全ての書き込み操作**（スコア1点の移動でも）がこの巨大JSONBカラム全体の READ + WRITE を発生させる
- **全ての Realtime Push** がこの巨大ペイロード全体を全クライアントに配信しようとする

#### 問題2: Realtime → refetch の二重読み込み

```
[操作クライアント]                          [他クライアント]
     |                                           |
     |-- transferScore (DB UPDATE) -->           |
     |                                           |
     |-- await refetch() (自発) ---------->      |
     |                              Realtime Push |<-- (DB UPDATE通知)
     |                                           |
     |                                           |-- refetch() (Realtimeトリガー)
```

- `useRoomRealtime` は Realtime の UPDATE イベントを受信すると、**ペイロードのデータは使わずに** 新たに `refetch()` を実行する（L158-160）
- つまり Realtime は「変更通知」としてのみ使われ、実際のデータは毎回 REST API で再取得
- 操作元クライアントは `refetch()` を二重に実行する（自発 + Realtimeトリガー）
- デバウンス(300ms)はあるが、5人全員が操作すると Realtime Push × 5 → refetch × 5 が発生

#### 問題3: 楽観的ロックの不完全さ (Read-Modify-Write 競合)

`transferScore` のCAS検証フロー:
1. current_state を SELECT
2. クライアント側で計算
3. 計算結果で UPDATE（WHERE は `id=eq.${roomId}` のみ、バージョン検証なし）
4. 書き込み後に `__writeId__` を検証

**問題点:**
- ステップ1〜3の間に他クライアントが書き込むと**後勝ちで上書き**される
- `__writeId__` 検証はリトライのトリガーにはなるが、**上書きされたデータは既に失われている**
- 5人同時操作では衝突確率が非常に高い
- `forceEditScore`, `resetScores`, `undoLast`, `rollbackTo` 等にはCAS検証すらない

#### 問題4: エラーの握りつぶし（サイレントエラー）

- `transferScore` の L538: 最終リトライ後は「検証なしで成功扱い」 → **データが実際に反映されていなくても `{ error: null }` を返す**
- `useRoomRealtime` の `refetch` (L76-78): エラーが起きても `setError` を呼ばず `console.error` のみ → **UIに反映されない**
- ゲーム画面のエラーハンドラー（`[id].tsx` L67-75）: `error` ステートが変わった時だけ Alert → refetch 失敗は検知できない

### 0-3. 通信ルール策定（リファクタリング方針）

#### 原則1: データの正（Single Source of Truth）
- **DBが常に正**。クライアントはDBの状態を反映するのみ
- 楽観的更新（Optimistic Update）は導入しない（複数人同時操作の整合性を優先）

#### 原則2: 書き込みの原子性
- DB側の処理（RPC/Stored Procedure）で原子的に更新し、Read-Modify-Write 競合を排除
- クライアントは「何をしたいか」（意図）だけを送り、計算はDB側で行う

#### 原則3: 通信量の最小化
- `current_state` から履歴・精算データを分離し、変更頻度の高いデータと低いデータを別カラム/テーブルに
- Realtime Push のペイロードサイズを劇的に削減

#### 原則4: エラーの可視化
- 全ての書き込み操作のエラーをUIに表示する
- Realtime 切断時にUIフィードバックを提供する

---

## STEP 1: パフォーマンス低下とサイレントエラーの根本原因調査

### 1-1. 仮説検証結果

#### 仮説A: 「WebSocket が DB 更新のたびに全員に Push → 通信量が限界を超える」

**検証結果: 確認。ただし問題の本質は通信量ではなくペイロードサイズ。**

- Supabase Realtime の `postgres_changes` は DB の UPDATE ごとに全購読者に通知する（これ自体は正常）
- しかし現在の実装では、通知を受けた全クライアントが `refetch()` で **巨大な current_state 全体** を REST API で再取得する
- 5人が1操作/分のペースでも、1時間で 300回のDB更新 × 5人の refetch = **1500回のフルデータ取得**
- current_state が 1MB に膨張した場合、1500回 × 1MB = **1.5GB の通信量/時間**

#### 仮説B: 「操作ログの JSON 保存が DB の Read/Write を圧迫」

**検証結果: 確認。これが最大のボトルネック。**

- `__history__` の各エントリに `snapshot`（操作前の全プレイヤーの全データのディープコピー）が含まれる
- 具体的なサイズ見積もり（5人 × 2変数の場合）:
  - 1エントリの snapshot: 約500バイト
  - 200回操作後の `__history__`: 約100KB
  - 500回操作後: 約250KB
  - これに加えて `__settlements__` データも蓄積
- **全ての書き込み操作が、この全データの READ → 加工 → WRITE を行う**
- Supabase の無料プラン/Pro プランの JSONB カラムサイズ制限に到達する可能性あり

#### サイレントエラーの原因特定

**3箇所で致命的なエラー握りつぶしを確認:**

1. **`transferScore` L524-538（フォールバック）:**
   ```typescript
   // フォールバック: 検証なしで成功扱い（操作は必ず適用）
   return { error: null };
   ```
   最終リトライ後、`__writeId__` 検証をスキップして成功を返す。実際にはデータが上書きされて消えている可能性がある。

2. **`useRoomRealtime` refetch L76-78:**
   ```typescript
   } catch (err) {
     console.error("Error refetching room:", err);
     // ← setError() を呼んでいない → UIにエラーが表示されない
   }
   ```
   Realtime トリガーの refetch がタイムアウトや通信エラーで失敗しても、ユーザーには何も表示されない。

3. **Read-Modify-Write の非原子性:**
   `transferScore` でステップ1（SELECT）とステップ7（UPDATE）の間に他クライアントが UPDATE すると:
   - ステップ1で取得した古い `current_state` をベースに計算
   - ステップ7で他クライアントの変更を **丸ごと上書き**
   - `__writeId__` 検証で気付いてリトライするが、**上書きされた他クライアントのデータは既に消失**
   - これは「操作が反映されない」ではなく「他人の操作が消える」

### 1-2. 抜本的改善案

#### 改善A: データ構造の正規化（履歴テーブルの分離）

```sql
-- 新テーブル: room_history
CREATE TABLE public.room_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  snapshot JSONB NOT NULL, -- その時点のスナップショット
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX idx_room_history_room_id ON public.room_history(room_id);
CREATE INDEX idx_room_history_created_at ON public.room_history(room_id, created_at DESC);

-- 新テーブル: room_settlements
CREATE TABLE public.room_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('settlement', 'adjustment')),
  player_results JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX idx_room_settlements_room_id ON public.room_settlements(room_id);
```

**効果:**
- `current_state` にはプレイヤーの現在値と `__pot__` のみ残る → **サイズが劇的に縮小（数KB以下）**
- 履歴の読み取りは必要時のみ（履歴ログ表示時）
- 書き込み時に履歴全体を読み書きする必要がなくなる

#### 改善A-2: 履歴表示の二層設計（プレビュー + ページネーションモーダル）

現在の `HistoryLog.tsx` は `room.current_state.__history__` 全件を props で受け取り、
モーダル展開時に全件を一括レンダリングしている（`reversedHistory.map()`）。
データ正規化後は以下の二層設計に変更する:

**層1: 折りたたみ時のプレビュー（操作確認用）**
- 現在の動作を維持: 1分以内の操作 or 最新1件を表示
- データソース: `current_state` に最新N件（例: 5件）の「メッセージのみ」を保持する軽量フィールド `__recent_log__`
  ```json
  {
    "__recent_log__": [
      { "id": "...", "timestamp": 1700000000000, "message": "太郎 → 花子: 点数 8000" }
    ]
  }
  ```
- snapshot は含めない（プレビューには不要）→ Realtime Push のペイロード増加を最小限に抑える
- RPC でスコア操作を行う際に、DB 側で `__recent_log__` を自動更新（最新5件をリングバッファ的に保持）

**層2: 操作履歴モーダル（ページネーション取得）**
- モーダルを開いた時に初めて `room_history` テーブルから取得する（初期ロードなし）
- **10件ずつカーソルベースのページネーション**で取得
  ```typescript
  // 履歴取得API（新設）
  export async function fetchHistory(
    roomId: string,
    cursor?: string, // 最後に取得した履歴のcreated_at（ISO文字列）
    limit: number = 10
  ): Promise<{ entries: HistoryEntry[]; hasMore: boolean }> {
    let query = supabase
      .from("room_history")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // 次ページ存在判定用に+1

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    // ...
  }
  ```
- **スクロールが最下部に到達したら次の10件をフェッチ**（`onScroll` or `onEndReached` で実装）
- ロールバック・Undo 操作は `room_history` テーブルの `id` を指定して RPC で実行

**HistoryLog コンポーネントの改修イメージ:**
```typescript
// モーダル内のScrollView
<ScrollView
  onScroll={({ nativeEvent }) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const isBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
    if (isBottom && hasMore && !isFetchingMore) {
      loadMoreHistory();
    }
  }}
  scrollEventThrottle={400}
>
  {historyEntries.map((entry) => (
    // ... 既存のレンダリングロジック
  ))}
  {isFetchingMore && <ActivityIndicator />}
</ScrollView>
```

**この設計の利点:**
1. 折りたたみ時のプレビューは Realtime 経由で即座に更新される（操作確認の即時性を維持）
2. モーダルは開かない限りデータを取得しない → 通常のゲームプレイ中の通信量ゼロ
3. 10件ずつの取得により、数百件の履歴があっても初期表示が高速
4. snapshot データはモーダルで必要な時だけ取得される（ロールバック操作時）

#### 改善B: DB側 RPC による原子的更新

```sql
-- 例: スコア移動のRPC
CREATE OR REPLACE FUNCTION public.transfer_score(
  p_room_id UUID,
  p_from_id TEXT,
  p_to_id TEXT,
  p_transfers JSONB, -- [{"variable": "score", "amount": 1000}]
  p_from_name TEXT DEFAULT NULL,
  p_to_name TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_state JSONB;
  v_template JSONB;
  v_snapshot JSONB;
  v_transfer RECORD;
  v_from_val NUMERIC;
  v_message TEXT;
BEGIN
  -- 行ロック付きで取得（FOR UPDATE で競合を排除）
  SELECT current_state, template INTO v_state, v_template
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_state IS NULL THEN
    RETURN jsonb_build_object('error', 'ルームが見つかりません');
  END IF;

  -- スナップショット作成（__history__, __writeId__ を除外）
  v_snapshot := v_state - '__history__' - '__writeId__' - '__settlements__';

  -- 各 transfer を適用（DB側で計算）
  FOR v_transfer IN SELECT * FROM jsonb_to_recordset(p_transfers) AS x(variable TEXT, amount NUMERIC)
  LOOP
    -- ... 計算ロジック（省略、現在の transferScore と同等）
  END LOOP;

  -- current_state を更新（履歴は別テーブルに INSERT）
  UPDATE public.rooms SET current_state = v_state WHERE id = p_room_id;

  -- 履歴を別テーブルに保存
  INSERT INTO public.room_history (room_id, message, snapshot)
  VALUES (p_room_id, v_message, v_snapshot);

  RETURN jsonb_build_object('success', true);
END;
$$;
```

**効果:**
- `FOR UPDATE` 行ロックにより、同時書き込みでデータが消失しない
- Read-Modify-Write が DB トランザクション内で完結 → 競合が原理的に発生しない
- クライアント側の CAS リトライロジックが不要になる

#### 改善C: エラーハンドリングの徹底

```typescript
// useRoomRealtime の refetch でエラーを可視化
} catch (err) {
  console.error("Error refetching room:", err);
  setError(err instanceof Error ? err : new Error("データの取得に失敗しました"));
  // → ゲーム画面側の error useEffect でユーザーに通知される
}
```

```typescript
// transferScore のフォールバックを廃止
// 最終リトライ後もエラーを返す
if (attempt === MAX_RETRIES) {
  return { error: new Error("書き込み競合が解消されませんでした。再度お試しください。") };
}
```

---

## STEP 2: 予期せぬ切断・画面遷移の調査とレジリエンス向上

### 2-1. 「ルームが見つかりません」画面遷移の原因特定

**原因を特定しました。2つの経路があります:**

#### 経路A: `useRoomRealtime` の refetch 失敗 → room が null に

`useRoomRealtime` の初期データ取得（`fetchInitialData`）:
```typescript
// L119-125
if (fetchError) {
  throw fetchError;  // → setError() が呼ばれる
}
if (!data) {
  throw new Error("ルームが見つかりません");  // → setError() が呼ばれる
}
```

ゲーム画面（`[id].tsx` L67-75）:
```typescript
useEffect(() => {
  if (error) {
    Alert.alert("エラー", error.message, [
      { text: "OK", onPress: () => router.back() },
    ]);
  }
}, [error]);
```

**しかし、`refetch()` では `setError()` が呼ばれない（L76-78）。** なので refetch 失敗では error 経由の遷移は起きない。

#### 経路B（真の原因）: Supabase のセッション切れ → API 失敗 → room が null に

長時間使用時の流れ:
1. Supabase の JWT トークンが期限切れ（デフォルト1時間）
2. `autoRefreshToken: true` だが、アプリがバックグラウンドにいた場合はリフレッシュが遅延
3. トークン切れ状態で何らかの API 操作が実行される
4. RLS ポリシーにより、認証が切れたリクエストは拒否される
5. **しかし `rooms` テーブルの SELECT ポリシーは `USING (true)` なので、SELECT は通る**
6. **UPDATE ポリシーも `USING (true)` / `WITH CHECK (true)` なので、実は認証切れでもUPDATEは通る**

→ つまり RLS レベルの認証エラーではない。

**真の原因の再調査:**

`[id].tsx` L134-144 を確認:
```typescript
if (!room) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerContent}>
        <Text style={styles.errorText}>ルームが見つかりません</Text>
        ...
      </View>
    </SafeAreaView>
  );
}
```

`room` が `null` になるケース:
1. `useRoomRealtime` の `setRoom(null)` が呼ばれる場合
2. 初回ロード失敗時（`fetchInitialData` でエラー → `room` が null のまま）
3. **DELETE イベント受信時（L170-173）**: `setRoom(null); setError(new Error("ルームが削除されました"));`
4. `roomId` が falsy の場合（L96-100）

**最も可能性の高いシナリオ:**
- 長時間使用中に WebSocket 接続が切断される
- Supabase Realtime が再接続を試みる
- 再接続中に他のクライアントがルームを更新
- 再接続後、蓄積されていた変更イベントが一括で配信される
- その中に DELETE イベントが含まれている場合（※誤検知の可能性）、または
- **WebSocket が完全に切断され、Realtime チャンネルの `subscribe` コールバックで `error` や `timed_out` ステータスを受信** → しかし現在のコードではこれを処理していない（L174-176）

```typescript
// 現在のコード（L174-176）
.subscribe();
// ← subscribe のステータスを監視していない！
```

### 2-2. WebSocket の自動再接続

**現在の問題:**
- `supabase.channel().subscribe()` はステータスコールバックを受け取れるが、現在はコールバックなしで呼んでいる
- WebSocket が `CHANNEL_ERROR` や `TIMED_OUT` になった場合のハンドリングがない
- Supabase JS クライアントは内部的に WebSocket の再接続を試みるが、チャンネルの再購読は自動では行われない場合がある

### 2-3. レジリエンス向上の改善計画

#### 改善D: Realtime チャンネルのステータス監視と再接続

```typescript
// useRoomRealtime.ts
channel = supabase
  .channel(channelId)
  .on("postgres_changes", { ... }, () => { refetchRef.current(); })
  .on("postgres_changes", { event: "DELETE", ... }, () => { ... })
  .subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      // 正常購読開始（再接続後も呼ばれる）
      refetchRef.current(); // 再接続時にデータを最新化
    } else if (status === "CHANNEL_ERROR") {
      console.error("Realtime channel error:", err);
      // エラーをユーザーに通知（致命的ではない、自動リトライされる）
      setConnectionWarning(true);
    } else if (status === "TIMED_OUT") {
      console.error("Realtime channel timed out");
      // 手動でチャンネルを再購読
      channel.subscribe();
    }
  });
```

#### 改善E: 接続状態インジケータの追加

ゲーム画面に接続状態を表示するバナーを追加:

```typescript
// ゲーム画面のヘッダー下に表示
{connectionWarning && (
  <View style={styles.connectionBanner}>
    <Text>⚠️ サーバーとの接続が不安定です。自動再接続を試みています...</Text>
  </View>
)}
```

#### 改善F: error → 画面遷移の防止（グレースフルデグラデーション）

現在の実装では `error` が設定されると即座に `router.back()` するが、一時的な通信エラーでは遷移すべきでない:

```typescript
// 改善案: エラーの種類に応じて挙動を変える
useEffect(() => {
  if (error) {
    if (error.message === "ルームが削除されました") {
      // 永続的エラー → 遷移
      Alert.alert("ルーム削除", error.message, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      // 一時的エラー → リトライ可能な通知
      Alert.alert("通信エラー", error.message, [
        { text: "リトライ", onPress: () => { setError(null); refetch(); } },
        { text: "戻る", onPress: () => router.back(), style: "cancel" },
      ]);
    }
  }
}, [error]);
```

#### 改善G: アプリ復帰時の完全な状態復元

現在は `AppState` の `active` 復帰時に `refetch()` を呼んでいるが:
1. Realtime チャンネルの再接続確認
2. Presence の再 track
3. データの再取得

をまとめて行う「復帰ハンドラー」を実装する。

---

## 実装ロードマップ（優先度順）

### Phase 7.1: サイレントエラーの修正（即時対応、低リスク）
- [ ] `transferScore` のフォールバック廃止 → エラーを返すように変更
- [ ] `useRoomRealtime` の `refetch` エラーを `setError` に反映
- [ ] ゲーム画面のエラーハンドラーを改善（一時/永続エラーの分類）
- 工数見積: 小（コード変更は少数行）

### Phase 7.2: Realtime チャンネルの健全性監視（即時対応、低リスク）
- [ ] `subscribe()` にステータスコールバックを追加
- [ ] `CHANNEL_ERROR` / `TIMED_OUT` のハンドリング
- [ ] 再接続時のデータ再取得
- [ ] 接続状態インジケータの追加
- 工数見積: 小〜中

### Phase 7.3: データ構造の正規化（中期、最重要だが影響大）
- [ ] `room_history` テーブルの作成（マイグレーション SQL）
- [ ] `room_settlements` テーブルの作成（マイグレーション SQL）
- [ ] `current_state` に `__recent_log__`（最新5件のメッセージのみ）を導入
- [ ] `current_state` から `__history__`、`__settlements__` を分離
- [ ] 既存データのマイグレーション（既存 `__history__` → `room_history` テーブルへ移行）
- [ ] `roomApi.ts` に `fetchHistory(roomId, cursor, limit)` ページネーション API を新設
- [ ] `HistoryLog.tsx` の二層化:
  - 折りたたみ時: `__recent_log__` からプレビュー表示（1分以内 or 最新1件）
  - モーダル展開時: `fetchHistory` で10件ずつ取得、スクロール末尾で追加ロード
- [ ] Realtime の購読対象調整（`current_state` のみ監視、履歴は REST で取得）
- 工数見積: 大

### Phase 7.4: DB側 RPC による原子的更新（中期、重要）
- [ ] `transfer_score` RPC の実装
- [ ] `force_edit_score` RPC の実装
- [ ] `reset_scores` RPC の実装
- [ ] `undo_last` / `rollback_to` RPC の実装
- [ ] `roomApi.ts` の各関数を RPC 呼び出しに変更
- [ ] CAS リトライロジックの撤去
- 工数見積: 大

### Phase 7.5: 通信最適化（長期、パフォーマンス向上）
- [ ] Realtime ペイロードの差分配信検討（Supabase の制約確認）
- [ ] refetch のスマートキャッシュ（ETag / Last-Modified）
- [ ] 操作元クライアントの二重 refetch 防止
- 工数見積: 中

---

## RLS ポリシーの注意事項

現在の UPDATE ポリシー（`003_allow_guests_to_update_rooms.sql`）:
```sql
CREATE POLICY "Authenticated users can update rooms"
  ON public.rooms FOR UPDATE
  USING (true) WITH CHECK (true);
```

**これは認証済みであれば誰でも任意のルームを更新できる**ことを意味する。RPC化の際に、RPC内部で権限チェックを行うか、より厳密なRLSポリシーに変更することを推奨する。

---

## まとめ

| 問題 | 根本原因 | 対策 | 優先度 |
|------|---------|------|--------|
| 5秒以上の遅延 | 巨大JSONB の全体 R/W | データ正規化 (7.3) | 最高 |
| 操作が反映されない | CAS 競合 + フォールバック | RPC化 (7.4) + エラー修正 (7.1) | 最高 |
| サイレントエラー | refetch エラー握りつぶし | エラーハンドリング修正 (7.1) | 緊急 |
| 画面遷移（落とされる） | Realtime 切断未処理 | チャンネル監視 (7.2) + エラー分類 (7.1) | 高 |
| 通信量の爆発 | 毎回全データ refetch | データ分離 (7.3) + 差分配信 (7.5) | 高 |
| 履歴モーダルの全件描画 | __history__ 全体が current_state に同居 | 二層設計: プレビュー(__recent_log__) + ページネーション (7.3) | 高 |
