# Phase 5: UX改善 & 安定性向上

> **前提**: Phase 4.5（架空ユーザー・カード情報モーダル）、Phase 4.6（ゲスト改善・精算バグ修正）まで完了。
> 直近のコミット履歴（`47c6c1a` 〜 `c5ea10a`）で、ゲスト機能・精算履歴調整・スクロール対応等が実装済み。

---

## 5.1: ゲーム画面 UX改善

### 5.1.1: 履歴ログ — 最新1分間の全ログ表示

**現状**: 折りたたみ時は最新1件のみプレビュー表示（`HistoryLog.tsx:132-141`）。

**変更内容**:
- 折りたたみ時、`timestamp` が現在時刻から60秒以内のエントリを **全て** 表示する
- 表示は新しい順（現状の `reversedHistory` と同じ）
- 1分経過したエントリは自動的に非表示になる（タイマーで再レンダー）

**実装方針**:
```typescript
// HistoryLog.tsx
const [now, setNow] = useState(Date.now());

// 10秒ごとに現在時刻を更新（古いログを消すため）
useEffect(() => {
  const timer = setInterval(() => setNow(Date.now()), 10_000);
  return () => clearInterval(timer);
}, []);

const ONE_MINUTE = 60_000;
const recentEntries = history
  .filter((e) => now - e.timestamp < ONE_MINUTE)
  .reverse(); // 新しい順
```

- `!isExpanded` 時のプレビュー部分を、単一エントリから `recentEntries.map(...)` に変更
- 各エントリの表示形式は既存のプレビューと同一（時刻 + メッセージ1行）

**対象ファイル**: `app/components/game/HistoryLog.tsx`

---

### 5.1.2: ログ一覧モーダル — 下スワイプ / 画面外タップで閉じる

**現状**: モーダルは `✕` ボタンでのみ閉じる（`HistoryLog.tsx:155-160`）。

**変更内容**:
1. **画面外タップ（オーバーレイ領域）で閉じる**: `modalOverlay` に `onPress` を追加
2. **下スワイプで閉じる**: `Gesture.Pan()` を追加し、下方向に一定距離スワイプで閉じる

**実装方針**:
```typescript
// オーバーレイタップで閉じる
<TouchableOpacity
  style={styles.modalOverlay}
  activeOpacity={1}
  onPress={() => setIsExpanded(false)}
>
  <View
    style={styles.modalContent}
    onStartShouldSetResponder={() => true} // 内側タップの伝播を止める
  >
    {/* ... */}
  </View>
</TouchableOpacity>
```

- 下スワイプ: `PanResponder` または `Gesture.Pan()` で `translationY > 80` 時に閉じる
- `SettlementHistory` にも同様の変更を適用

**対象ファイル**: `app/components/game/HistoryLog.tsx`, `app/components/game/SettlementHistory.tsx`

---

### 5.1.3: 支払い入力欄 — デフォルト空欄化

**現状**: `PaymentModal` のテキスト入力は `"0"` で初期化される（`PaymentModal.tsx:33`）。ユーザーは `0` を消してから入力する必要がある。

**変更内容**:
- 初期値を `""` (空文字) に変更
- `placeholder` を `"0"` に設定（グレーで表示）
- Submit時: 空欄は `0` として扱う（既存の `parseInt(..., 10)` が `NaN` → `0` になるよう `|| 0` で担保）
- **確認ボタンの有効化条件**: 少なくとも1つの変数に数値（>0）が入力されている場合のみ有効（現状と同じロジック）

**実装方針**:
```typescript
// PaymentModal.tsx
useEffect(() => {
  if (visible) {
    const initial: { [key: string]: string } = {};
    variables.forEach((v) => {
      initial[v.key] = ""; // 空欄で初期化
    });
    setAmounts(initial);
  }
}, [visible, variables]);
```

- `value={amounts[variable.key] || "0"}` → `value={amounts[variable.key]}`
- `placeholder` を `"0"` ではなく **`\`${variable.label}を入力\``** に設定（例: 「点数を入力」）

**対象ファイル**: `app/components/game/PaymentModal.tsx`

---

### 5.1.4: ホスト着席時の空席表示 — 「長押しでゲスト作成」固定表示

**現状**: `EmptySeat` はホストの場合、5秒ごとに「着席する」⇄「長押しでゲスト作成」を交互表示する（`EmptySeat.tsx:22-33`）。ホストが既に着席している場合、自分では着席できないため「着席する」表示は不要。

**変更内容**:
- ホストが着席済みの場合、空席のラベルを常に `"長押しでゲスト作成"` に固定
- 短押し（`onPress`）も `onLongPressJoinFake` と同じ動作にする（ホスト着席時のみ）
- ホストが未着席の場合は現行動作を維持（交互表示）

**実装方針**:
- `EmptySeat` に `isHostSeated?: boolean` プロパティを追加
- `isHostSeated && onLongPressJoinFake` の場合:
  - ラベル: `"長押しでゲスト作成"` 固定
  - `onPress` → `onLongPressJoinFake(seatIndex)` に変更（タップでもゲスト作成）
  - 5秒間隔のタイマー不要

**対象ファイル**: `app/components/game/EmptySeat.tsx`, `app/components/game/MahjongTable.tsx`（`isHostSeated` の計算と伝搬）

---

### 5.1.5: 精算表 — 右スワイプで全画面別ページ表示

**現状**: 精算履歴は下からスライドするモーダルで表示（`SettlementHistory.tsx`）。テーブルが横長のため狭い。左スワイプでモーダルを開く動作のみ実装（`[id].tsx:514-521`）。

**変更内容**:
- **右スワイプ**で精算履歴を**全画面の別ページ**として表示する
- 現在のモーダル表示（ボタンタップ / 左スワイプ）は廃止し、右スワイプ + 専用ページに一本化
- ページは `app/app/game/settlement/[id].tsx` として新規作成
- ページ内は横スクロール可能なテーブル（全幅活用）
- 戻る操作は左スワイプ or 戻るボタン

**実装方針**:

1. **新規ページ作成**: `app/app/game/settlement/[id].tsx`
   - `useLocalSearchParams` で `id` を取得
   - `useRoomRealtime(id)` で精算データを取得
   - 全画面でテーブル表示（`SettlementHistory` のテーブル部分を流用）
   - 調整追加機能もこのページ内に移動

2. **ゲーム画面の変更** (`[id].tsx`):
   - 左スワイプジェスチャー（`swipeGesture`）を**右スワイプ**に変更
   - `setSettlementHistoryVisible(true)` → `router.push(\`/game/settlement/${room.id}\`)` に変更
   - `SettlementHistory` のモーダル表示コード削除
   - `📊` ボタン（HistoryLog内）も同様にページ遷移に変更

3. **SettlementHistory の改修**:
   - モーダルラッパーを除去し、テーブル部分を単独コンポーネントとして export
   - 新規ページからインポートして使用

**対象ファイル**:
| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/app/game/settlement/[id].tsx` | 新規作成 | 精算履歴全画面ページ |
| `app/components/game/SettlementHistory.tsx` | 変更 | モーダルラッパー除去、テーブルのみのコンポーネント化 |
| `app/app/game/[id].tsx` | 変更 | スワイプ方向変更、ページ遷移化 |
| `app/components/game/HistoryLog.tsx` | 変更 | 📊ボタンのナビゲーション変更 |

### 5.1.6: 変数操作結果のトースト通知

**現状**: 支払い等の変数操作後、成功/失敗はモーダル内の `Alert.alert` でしか通知されない。モーダルが閉じた後に操作結果が一目でわからない。

**変更内容**:
- 変数操作（`transferScore` 等）の結果を、画面下部に小さなカードで **5秒間** 表示する
- 成功時: 緑背景 + チェックマーク + 操作内容サマリ（例: 「支払いが完了しました」）
- 失敗時: 赤背景 + エラーアイコン + エラーメッセージ（例: 「支払いに失敗しました」）
- 5秒後に自動フェードアウト、またはタップで即消し
- 複数通知は上に積み上げ（最新が下）

**実装方針**:

1. **`Toast` コンポーネント新規作成** (`app/components/common/Toast.tsx`):
   ```typescript
   interface ToastItem {
     id: string;
     type: "success" | "error";
     message: string;
   }

   interface ToastProps {
     toasts: ToastItem[];
     onDismiss: (id: string) => void;
   }
   ```
   - `Animated.View` で下からスライドイン → 5秒後にフェードアウト
   - 成功: `backgroundColor: "#10b981"` (緑)、失敗: `backgroundColor: "#ef4444"` (赤)
   - カードの高さは最小限（paddingVertical: 10, fontSize: 14）
   - `position: "absolute"`, `bottom: 20` でゲーム画面の下部に重ねて表示
   - タップで即消し（`onDismiss` コールバック）

2. **`useToast` フック新規作成** (`app/hooks/useToast.ts`):
   ```typescript
   function useToast() {
     const [toasts, setToasts] = useState<ToastItem[]>([]);

     const show = useCallback((type: "success" | "error", message: string) => {
       const id = generateId();
       setToasts((prev) => [...prev, { id, type, message }]);
       setTimeout(() => dismiss(id), 5000);
     }, []);

     const dismiss = useCallback((id: string) => {
       setToasts((prev) => prev.filter((t) => t.id !== id));
     }, []);

     return { toasts, show, dismiss };
   }
   ```

3. **ゲーム画面への統合** (`app/app/game/[id].tsx`):
   ```typescript
   const { toasts, show: showToast, dismiss: dismissToast } = useToast();

   const handleTransfer = async (...) => {
     // ... 既存のtry-catch ...
     if (error) {
       showToast("error", error.message);
       return;
     }
     showToast("success", "支払いが完了しました");
     await refetch();
   };

   // レンダリング（SafeAreaView の末尾に配置）
   <Toast toasts={toasts} onDismiss={dismissToast} />
   ```

   - `handleTransfer`, `handleRollback`, `handleUndo`, `handleSettlement` 等の各操作ハンドラーに適用
   - 既存の `Alert.alert("エラー", ...)` を `showToast("error", ...)` に置換（ユーザー確認が必要なダイアログは `Alert` のまま維持）

**対象ファイル**:
| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/components/common/Toast.tsx` | 新規作成 | トーストカードコンポーネント |
| `app/hooks/useToast.ts` | 新規作成 | トースト状態管理フック |
| `app/app/game/[id].tsx` | 変更 | トースト統合、Alert→Toast置換 |

---

## 5.2: ホスト管理機能改善

### 5.2.1: 数値のマイナス入力許可

**現状**: `VariableEditor.tsx` の `handleInitialChange` では `text === "-"` をリジェクトしている（L40-42）。`PaymentModal.tsx` の `handleAmountChange` では数字以外を除外（L43）。

**変更内容**:
- **VariableEditor**: 初期値にマイナス値を入力可能にする
  - `text === "-"` の場合は一時的に文字列として保持、`onUpdate` は呼ばない
  - 完全な負数（例: `"-100"`）になったら `onUpdate` を呼ぶ
  - 入力中の文字列は local state で管理
- **PaymentModal**: 支払い金額にもマイナス入力を許可
  - `replace(/[^0-9]/g, "")` → `replace(/[^0-9-]/g, "")` に変更
  - 先頭の `-` のみ許可（中間のマイナスは除去）
  - 負数のtransferは「逆方向の支払い」として扱う（既存の `transferScore` ロジックで自然に動作）

**対象ファイル**: `app/components/settings/VariableEditor.tsx`, `app/components/game/PaymentModal.tsx`

---

### 5.2.2: 作成済み変数キーの変更不可化

**現状**: 変数キーは `VariableEditor.tsx` で **既に変更不可**（`Text` コンポーネントで表示: L120）。

**確認結果**: この機能は **既に実装済み**。追加の変更は不要。

---

### 5.2.3: 基準値変更時の差分スライド適用

**現状**: `updateTemplate` で変数の `initial` を変更しても、既存プレイヤーの値は `undefined` の場合のみ初期値が設定される（`roomApi.ts:908`）。既にスコアを持つプレイヤーには影響しない。

**例**: 初期値を `25000 → 35000` に変更した場合、差分 `+10000` を全プレイヤーに適用したい。

**変更内容**:
- `updateTemplate` 内で `templateUpdate.variables` が含まれる場合、各変数の `initial` 値を旧テンプレートと比較
- 差分が0でない変数について、全プレイヤーの該当変数に差分を加算
- 履歴のスナップショット内のプレイヤーデータにも同様に差分を適用（ロールバック時の整合性確保）
- 供託金（`__pot__`）は差分スライド対象外（変更なし）

**実装方針**:
```typescript
// roomApi.ts updateTemplate() 内
if (templateUpdate.variables) {
  const oldVariables = room.template.variables || [];

  for (const newVar of templateUpdate.variables) {
    const oldVar = oldVariables.find((v) => v.key === newVar.key);
    if (!oldVar) continue; // 新規追加変数は既存ロジックで処理

    const diff = newVar.initial - oldVar.initial;
    if (diff === 0) continue;

    // 全プレイヤーに差分適用
    for (const playerId of playerIds) {
      if (currentState[playerId][newVar.key] !== undefined) {
        currentState[playerId][newVar.key] += diff;
      }
    }

    // 履歴スナップショットにも差分適用
    for (const entry of history) {
      // ...同様のロジック
    }
  }
}
```

**注意事項**:
- 新規追加された変数（`oldVar` が `undefined`）には差分適用しない（初期値を設定する既存ロジックのみ）
- 差分適用は履歴メッセージとして記録はしない（テンプレート更新の一部として処理）

**対象ファイル**: `app/lib/roomApi.ts`（`updateTemplate` 関数）

---

## 5.3: システム安定性

### 5.3.1: 変数操作APIへのエラーハンドリング追加

**現状**: `transferScore` 等のAPI関数は `try-catch` で囲まれているが、呼び出し元（`[id].tsx`）でも `try-catch` + `Alert.alert` でハンドリングしている。しかし以下の問題がある:

1. **エラー時のUI状態不整合**: API呼び出し中にUIがロック状態にならない（二重送信リスク）
2. **ネットワークエラーの区別**: Supabaseの接続エラーとビジネスロジックエラーの区別がない
3. **リトライ機構**: ネットワーク一時障害時のリトライがない

**変更内容**:
- **API呼び出し中のロック機構**: `transferScore` 等を呼ぶ際に `isProcessing` フラグを立て、処理中は追加操作を受け付けない
- **タイムアウト付きfetch**: Supabaseクエリに `AbortController` によるタイムアウトを追加（10秒）
- **エラー種別の分類**: ネットワークエラー / ビジネスロジックエラー / タイムアウトを区別し、適切なメッセージを表示

**実装方針**:
```typescript
// [id].tsx に追加
const [isProcessing, setIsProcessing] = useState(false);

const handleTransfer = async (...) => {
  if (isProcessing) return; // 二重送信防止
  setIsProcessing(true);
  try {
    const { error } = await transferScore(...);
    if (error) {
      Alert.alert("エラー", error.message);
      return;
    }
    await refetch();
  } catch (error) {
    Alert.alert("エラー", "通信エラーが発生しました。再度お試しください。");
  } finally {
    setIsProcessing(false);
  }
};
```

- `isProcessing` を `MahjongTable` に伝搬し、ドラッグ操作を無効化
- `PaymentModal` の確認ボタンも `isProcessing` 時は無効化

**対象ファイル**: `app/app/game/[id].tsx`, `app/components/game/MahjongTable.tsx`, `app/components/game/PaymentModal.tsx`

---

### 5.3.2: 支払い時のデッドロック・コマンド滞留調査と修正

**問題**: 支払い操作でエラーが発生した際、UIが操作受付不可状態に陥ることがある。

**想定される原因**:
1. **楽観的ロックの不在**: `transferScore` は「最新取得 → 計算 → 書き込み」のパターンだが、2つのクライアントが同時に操作すると、片方の書き込みが他方の変更を上書きする（Last Write Wins）。これ自体はデッドロックではないが、データ不整合が発生する。

2. **`refetch()` の無限ループ**: `transferScore` 成功後の `refetch()` がリアルタイム更新と競合し、連続的なrefetchが発生する可能性。

3. **未解決のPromise**: `handleTransfer` 内で `await refetch()` が返らないケース。`useRoomRealtime` の `refetch` 実装を確認する必要がある。

4. **`isProcessing` 未リセット**: 現状では `isProcessing` フラグがないため直接の原因ではないが、5.3.1 で導入する際に `finally` ブロックで確実にリセットすることが重要。

**調査・修正方針**:

1. **`transferScore` にCAS（Compare-And-Swap）リトライループを導入**:

   **核心原則**: 転送操作は**相対的な加減算（デルタ）**であり、ユーザーが古いデータを見ていたとしても、操作自体は必ず最新stateに対して適用されなければならない。したがって「競合→拒否」ではなく「競合→最新state再取得→同じデルタを再適用→再書き込み」のパターンを採用する。

   - `updated_at` カラム（または `__version__` カウンター）を利用したCASで書き込みの原子性を担保
   - CAS失敗時は**最新の `current_state` を再取得**し、**同じ `transfers` 配列（デルタ）を再計算**して再書き込み
   - ユーザーが入力した転送量は変わらない — 適用先のベースstateだけが更新される
   - リトライ上限は5回、指数バックオフ（100ms → 200ms → 400ms...）付き

   ```typescript
   // roomApi.ts transferScore() 内
   const MAX_RETRIES = 5;
   for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
     // ① 最新state取得
     const { data: room } = await supabase
       .from("rooms")
       .select("current_state, template, updated_at")
       .eq("id", roomId)
       .single();

     // ② 同じ transfers[] デルタを最新stateに適用（計算）
     const currentState = { ...room.current_state };
     const beforeSnapshot = createSnapshot(currentState);
     for (const { variable, amount } of transfers) {
       // ... 既存の加減算ロジック（変更なし）
     }
     // 履歴エントリ追加 etc.

     // ③ CAS書き込み（updated_at が読み取り時と一致する場合のみ成功）
     const { error, count } = await supabase
       .from("rooms")
       .update({ current_state: newState })
       .eq("id", roomId)
       .eq("updated_at", room.updated_at);

     if (error) throw error;

     if (count === 1) {
       // 成功: 書き込み完了
       return { error: null };
     }

     // count === 0: 他クライアントが先に書き込んだ → リトライ
     // 同じ transfers[] を最新stateに再適用するため操作は失われない
     if (attempt < MAX_RETRIES - 1) {
       await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
     }
   }
   // 5回リトライしても競合が解消しない場合（極めて稀）
   // それでも操作を諦めず、CASなしでフォールバック書き込み
   // （Last Write Wins だがデータロストよりは操作適用を優先）
   const { data: finalRoom } = await supabase
     .from("rooms")
     .select("current_state, template")
     .eq("id", roomId)
     .single();
   // ... 同じデルタ適用 ...
   const { error: fallbackError } = await supabase
     .from("rooms")
     .update({ current_state: finalState })
     .eq("id", roomId);
   if (fallbackError) throw fallbackError;
   return { error: null };
   ```

   **重要な設計判断**:
   - CAS全リトライ失敗時も `throw` せず、**CASなしフォールバック書き込み**で操作を必ず適用する
   - フォールバックは Last Write Wins のリスクがあるが、操作の喪失（ユーザーが支払ったのに反映されない）よりも優先度が高い
   - `updated_at` カラムが `rooms` テーブルに存在するか確認が必要。存在しない場合は `__version__` カウンター（`current_state` 内の整数）で代替

   **他のAPI関数への適用**:
   - `rollbackTo`, `undoLast`, `forceEditScore`, `resetScores` 等も同じ read-modify-write パターンだが、これらはホスト専用操作で同時実行の可能性が低いためフェーズ1ではCAS化しない
   - 問題が報告された場合に順次適用

2. **`refetch` のデバウンス**:
   - `useRoomRealtime.ts` の `refetch` が短時間に複数回呼ばれた場合にデバウンスする
   - リアルタイム更新（Supabase Realtime）と手動refetchの競合を防止

3. **タイムアウト付き操作**:
   - 5.3.1のタイムアウト機構により、無限待機を防止

**対象ファイル**:
| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/lib/roomApi.ts` | 変更 | 楽観的ロック（リトライ）の導入 |
| `app/hooks/useRoomRealtime.ts` | 変更 | refetchのデバウンス |
| `app/app/game/[id].tsx` | 変更 | isProcessingフラグ + エラーハンドリング強化 |

---

## 実装順序

| 順番 | タスク | 依存 | 理由 |
|------|--------|------|------|
| 1 | 5.3.2 デッドロック調査・修正 | なし | 安定性が最優先。他の機能が正常動作する前提 |
| 2 | 5.3.1 エラーハンドリング追加 | 5.3.2 | ロック機構の上にエラーハンドリングを構築 |
| 3 | 5.1.6 トースト通知 | 5.3.1 | isProcessing + エラーハンドリングの上にトースト表示を構築 |
| 4 | 5.1.3 支払い入力欄デフォルト空欄化 | なし | 小規模変更、即効性高い |
| 5 | 5.1.1 最新1分間ログ表示 | なし | 小規模変更 |
| 6 | 5.1.2 ログモーダル閉じる動作 | なし | 小規模変更 |
| 7 | 5.1.4 ホスト着席時の空席表示固定 | なし | 小規模変更 |
| 8 | 5.2.1 マイナス入力許可 | なし | 設定画面の改善 |
| 9 | 5.2.3 基準値差分スライド | なし | 設定画面の改善 |
| 10 | 5.1.5 精算表の全画面ページ化 | なし | UI大改修のため最後に |

---

## 検証

- `cd app && npx tsc --noEmit` でコンパイル確認
- 支払い操作 → エラーなく完了、UI がロックされないこと
- 2端末から同時に支払い → データが正しく処理されること（競合テスト）
- 履歴ログ折りたたみ時 → 1分以内のログが全て表示されること
- ログモーダル → 画面外タップ / 下スワイプで閉じること
- 支払い入力欄 → 空欄状態で開き、プレースホルダー「{変数名}を入力」が表示されること
- ホスト着席時 → 空席が「長押しでゲスト作成」固定で表示、タップでも作成できること
- 設定画面 → 初期値にマイナス値が入力できること
- 初期値変更 → 差分が全プレイヤーに適用されること
- 支払い成功 → 画面下部に緑カード「支払いが完了しました」が5秒表示されること
- 支払い失敗 → 画面下部に赤カードでエラーメッセージが5秒表示されること
- トーストをタップ → 即座に消えること
- 精算表 → 右スワイプで全画面ページに遷移すること
