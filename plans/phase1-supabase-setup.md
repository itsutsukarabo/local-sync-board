# Phase 1: Supabase セットアップ手順

## 📋 実行チェックリスト

このドキュメントに従って、Supabase ダッシュボードで以下の設定を行ってください。

---

## 1️⃣ Anonymous Auth の有効化

### 手順：

1. Supabase ダッシュボードにログイン
2. プロジェクトを選択
3. 左サイドバーから **Authentication** → **Sign In / Providers** を開く
4. **Allow anonymous sign-ins** トグルを **ON** にする
5. **Save Changes** をクリック

## 2️⃣ `profiles` テーブルの作成

### 手順：

1. 左サイドバーから **SQL Editor** を開く
2. **New query** をクリック
3. 以下の SQL をコピー＆ペーストして実行

### SQL:

```sql
-- ============================================
-- profiles テーブルの作成
-- ============================================

-- 既存のテーブルを削除（初回実行時は無視されます）
DROP TABLE IF EXISTS public.profiles CASCADE;

-- profilesテーブルの作成
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  current_room_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスの作成（パフォーマンス向上）
CREATE INDEX idx_profiles_current_room ON public.profiles(current_room_id);

-- ============================================
-- RLS (Row Level Security) の設定
-- ============================================

-- RLSを有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ポリシー1: 全ユーザーが全プロファイルを参照可能
-- （ゲーム内で他のプレイヤー情報を表示するため）
CREATE POLICY "Anyone can view profiles"
  ON public.profiles
  FOR SELECT
  USING (true);

-- ポリシー2: 自分のプロファイルのみ挿入可能
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ポリシー3: 自分のプロファイルのみ更新可能
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ポリシー4: 自分のプロファイルのみ削除可能
CREATE POLICY "Users can delete their own profile"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);

-- ============================================
-- トリガー: updated_at の自動更新
-- ============================================

-- 関数の作成
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの作成
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- 自動プロファイル作成トリガー
-- ============================================

-- 新規ユーザー作成時に自動でprofilesレコードを作成
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- auth.usersテーブルにトリガーを設定
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

### 実行後の確認：

1. 左サイドバーから **Table Editor** を開く
2. `profiles` テーブルが表示されていることを確認
3. テーブルをクリックして、以下のカラムがあることを確認：
   - `id` (uuid)
   - `display_name` (text)
   - `avatar_url` (text)
   - `current_room_id` (uuid)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

---

## 3️⃣ RLS ポリシーの確認

### 手順：

1. **Table Editor** で `profiles` テーブルを選択
2. 右上の **⚙️ (設定アイコン)** → **Policies** をクリック
3. 以下の 4 つのポリシーが表示されていることを確認：
   - ✅ `Anyone can view profiles` (SELECT)
   - ✅ `Users can insert their own profile` (INSERT)
   - ✅ `Users can update their own profile` (UPDATE)
   - ✅ `Users can delete their own profile` (DELETE)

---

## 4️⃣ トリガーの確認

### SQL Editor で以下を実行してトリガーが正しく設定されているか確認：

```sql
-- トリガーの一覧を確認
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles';

-- auth.usersテーブルのトリガーを確認
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
  AND trigger_name = 'on_auth_user_created';
```

### 期待される結果：

**profiles テーブルのトリガー（1 件）:**

- `trigger_name`: `set_updated_at`
- `event_manipulation`: `UPDATE`
- `event_object_table`: `profiles`

**auth.users テーブルのトリガー（1 件）:**

- `trigger_name`: `on_auth_user_created`
- `event_manipulation`: `INSERT`
- `event_object_table`: `users`

---

## 5️⃣ 初期状態の確認

### SQL Editor で以下を実行：

```sql
-- 匿名ユーザーが作成されているか確認
SELECT id, email, is_anonymous, created_at
FROM auth.users
WHERE is_anonymous = true
LIMIT 5;

-- profilesテーブルの内容を確認
SELECT * FROM public.profiles;
```

### 期待される結果：

**✅ 正常な状態:**

```
Success. No rows returned
```

両方のクエリで上記が表示されれば**正しい状態**です。

**📝 説明:**

- 匿名ユーザーは、アプリから `supabase.auth.signInAnonymously()` を実行した時に初めて作成されます
- トリガー `on_auth_user_created` により、匿名ユーザー作成と同時に `profiles` レコードも自動作成されます
- 現時点では、まだアプリ側の実装が完了していないため、データが 0 件なのは正常です

**🔍 アプリ実装後の確認方法:**

アプリから初回ログイン後、再度上記の SQL を実行すると：

```sql
-- auth.users に匿名ユーザーが1件作成される
id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
email: null
is_anonymous: true

-- profiles にも自動的に1件作成される（トリガーによる）
id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (auth.usersと同じID)
display_name: null (Welcome画面で設定予定)
```

---

## ✅ 完了チェックリスト

以下をすべて確認してから、次のステップ（コード実装）に進んでください：

- [✅] Anonymous Auth が有効化されている
- [✅] `profiles` テーブルが作成されている
- [✅] 6 つのカラム（id, display_name, avatar_url, current_room_id, created_at, updated_at）が存在する
- [✅] RLS が有効化されている（Table Editor で確認）
- [✅] 4 つの RLS ポリシーが設定されている
- [✅] トリガー（updated_at 自動更新、新規ユーザー自動作成）が設定されている

---

## 🚨 トラブルシューティング

### エラー: "permission denied for schema auth"

- **原因**: auth.users テーブルへのアクセス権限がない
- **解決**: SQL 実行時に「Run as: postgres」を選択してください

### エラー: "relation 'profiles' already exists"

- **原因**: テーブルが既に存在している
- **解決**: SQL の最初の `DROP TABLE IF EXISTS` 部分を実行してから再実行

### RLS ポリシーが表示されない

- **確認**: SQL Editor で以下を実行
  ```sql
  SELECT * FROM pg_policies WHERE tablename = 'profiles';
  ```
- 4 行表示されれば OK

---

## 📝 次のステップ

このセットアップが完了したら、以下のメッセージで報告してください：

```
Supabaseのセットアップが完了しました。
- Anonymous Auth: 有効化済み
- profilesテーブル: 作成済み
- RLSポリシー: 設定済み

コードの実装を開始してください。
```

その後、アプリ側のコード実装（AuthContext、Welcome 画面など）を開始します。
