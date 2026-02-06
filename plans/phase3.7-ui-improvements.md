# Phase 3.7: UI改善計画

## 概要
ユーザー体験を向上させるためのUI改善を行う。

---

## Task 3.7-1: 複数変数同時支払い機能（高優先）

### 目的
他プレイヤーへの支払い時に、複数の変数を同時に支払えるようにする。

### 現状の問題
- 現在のPaymentModalは1つの変数を選択して1つの金額のみ入力可能
- 複数の変数がある場合、それぞれ別々にドラッグ操作を行う必要がある

### 実装内容

#### 1. Variable型の拡張
**ファイル**: `app/types/index.ts`

**変更点**:
- Variable型に `quickAmounts` プロパティを追加（オプショナル）

```typescript
export interface Variable {
  key: string;
  label: string;
  initial: number;
  quickAmounts?: number[]; // クイック選択ボタンの金額リスト
}
```

#### 2. デフォルトテンプレートの更新
**ファイル**: `app/constants/defaultTemplates.ts`

**変更点**:
- scoreの変数定義に `quickAmounts: [8000, 12000]` を追加

```typescript
variables: [
  { key: "score", label: "点数", initial: 25000, quickAmounts: [8000, 12000] },
  // 他の変数はquickAmountsなし（将来的にカスタマイズ可能）
]
```

#### 3. PaymentModalの改修
**ファイル**: `app/components/game/PaymentModal.tsx`

**変更点**:
- 単一入力フィールドから、全変数分の入力フィールドリストに変更
- 各変数の入力欄はデフォルト値を `0` に設定
- 1つ以上の変数が0以外の値を持っている場合のみ「支払う」ボタンが有効
- クイック選択は各変数の `quickAmounts` から取得（設定されている変数のみ表示）

**UI構成**:
```
┌─────────────────────────┐
│     支払い金額を入力      │
├─────────────────────────┤
│  点数:  [    0     ]    │
│    [8000] [12000]       │  ← quickAmountsが設定されている場合のみ表示
│  本数:  [    0     ]    │
│    (クイック選択なし)    │  ← quickAmountsが未設定の場合は非表示
├─────────────────────────┤
│  [キャンセル] [支払う]   │
└─────────────────────────┘
```

**実装詳細**:
```typescript
// 各変数の金額を管理するstate
const [amounts, setAmounts] = useState<{ [key: string]: string }>({});

// 初期化時に全変数を0で初期化
useEffect(() => {
  const initial: { [key: string]: string } = {};
  variables.forEach(v => {
    initial[v.key] = "0";
  });
  setAmounts(initial);
}, [variables]);

// 確定時に0以外の値を持つ変数のみtransfersに含める
const handleConfirm = () => {
  const transfers = variables
    .map(v => ({
      variable: v.key,
      amount: parseInt(amounts[v.key] || "0", 10)
    }))
    .filter(t => t.amount > 0);

  if (transfers.length === 0) return;
  onConfirm(transfers);
};

// 各変数ごとにクイック選択を表示
{variables.map(v => (
  <View key={v.key}>
    <View style={styles.inputRow}>
      <Text>{v.label}:</Text>
      <TextInput value={amounts[v.key]} ... />
    </View>
    {/* quickAmountsが設定されている場合のみクイック選択を表示 */}
    {v.quickAmounts && v.quickAmounts.length > 0 && (
      <View style={styles.quickButtons}>
        {v.quickAmounts.map(amount => (
          <TouchableOpacity onPress={() => setAmounts(prev => ({...prev, [v.key]: amount.toString()}))}>
            <Text>{amount.toLocaleString()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    )}
  </View>
))}
```

### 完了条件
- [ ] Variable型に `quickAmounts` プロパティが追加されている
- [ ] デフォルトテンプレートのscoreに `quickAmounts: [8000, 12000]` が設定されている
- [ ] PaymentModalに全変数の入力欄が表示される
- [ ] 各入力欄のデフォルト値が0である
- [ ] 0以外の値を持つ変数のみが支払いに含まれる
- [ ] 複数変数を同時に支払い可能
- [ ] quickAmountsが設定されている変数のみクイック選択が表示される

---

## Task 3.7-2: 接続切れ表示の改善（中優先）

### 目的
接続切れ表示をカード内部から外部（カード上部右側）に移動し、視認性を向上させる。

### 現状の問題
- 接続切れ表示がカード内部にあり、カードのレイアウトに影響
- 「切断中 X分XX秒」の表示が長く、スペースを取る

### 実装内容

#### 1. MahjongPlayerCardの改修
**ファイル**: `app/components/game/MahjongPlayerCard.tsx`

**変更前**:
```jsx
<Animated.View style={styles.card}>
  <View style={styles.header}>...</View>
  {disconnectedAt != null && (
    <Text style={styles.disconnectText}>
      {formatDisconnectDuration(disconnectedAt)}
    </Text>
  )}
  {/* 変数表示 */}
</Animated.View>
```

**変更後**:
```jsx
<View style={styles.cardWrapper}>
  {/* 接続切れバッジ - カードの右上に配置 */}
  {disconnectedAt != null && (
    <View style={styles.disconnectBadge}>
      <Text style={styles.disconnectBadgeText}>
        {formatDisconnectSeconds(disconnectedAt)}
      </Text>
    </View>
  )}

  <Animated.View style={styles.card}>
    <View style={styles.header}>...</View>
    {/* 変数表示（接続切れ表示はここから削除）*/}
  </Animated.View>
</View>
```

**表示フォーマット変更**:
```typescript
// 変更前
function formatDisconnectDuration(disconnectedAt: number): string {
  const elapsed = Math.floor((Date.now() - disconnectedAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  if (minutes > 0)
    return `切断中 ${minutes}分${seconds.toString().padStart(2, "0")}秒`;
  return `切断中 ${seconds}秒`;
}

// 変更後（秒数のみ）
function formatDisconnectSeconds(disconnectedAt: number): string {
  const seconds = Math.floor((Date.now() - disconnectedAt) / 1000);
  return `${seconds}秒`;
}
```

**スタイル追加**:
```typescript
cardWrapper: {
  position: 'relative',
},
disconnectBadge: {
  position: 'absolute',
  top: -8,
  right: -8,
  backgroundColor: '#ef4444',
  borderRadius: 10,
  paddingHorizontal: 6,
  paddingVertical: 2,
  zIndex: 10,
},
disconnectBadgeText: {
  color: '#ffffff',
  fontSize: 10,
  fontWeight: 'bold',
},
```

### 完了条件
- [ ] 接続切れ表示がカード外部（右上）に移動
- [ ] 表示が秒数のみのコンパクトな形式（例: "45秒"）
- [ ] カード内部のレイアウトに影響しない
- [ ] バッジが視認しやすい赤色背景

---

## 実装順序

1. **Task 3.7-1**: 複数変数同時支払い機能
   - PaymentModalの改修
   - テスト確認

2. **Task 3.7-2**: 接続切れ表示の改善
   - MahjongPlayerCardの改修
   - テスト確認

---

## 関連ファイル

- `app/types/index.ts` - Variable型定義
- `app/constants/defaultTemplates.ts` - デフォルトテンプレート
- `app/components/game/PaymentModal.tsx` - 支払いモーダル
- `app/components/game/MahjongPlayerCard.tsx` - プレイヤーカード
- `app/components/game/MahjongTable.tsx` - 麻雀テーブル（参照のみ）
