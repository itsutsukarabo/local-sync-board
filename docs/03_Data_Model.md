# データモデル設計書 (Supabase Schema)

## 1. テーブル構成
PostgreSQLのテーブルとして以下を作成する。

### 1.1 rooms (ゲームセッション)
1つのゲームプレイの単位。

| Column | Type | Note |
|:---|:---|:---|
| `id` | uuid | Primary Key |
| `room_code` | text | 参加用ショートコード (e.g. "1234") |
| `host_user_id` | uuid | 親機のUser ID (Supabase Auth) |
| `status` | text | "waiting", "playing", "finished" |
| `template` | jsonb | ボード定義（レイアウト、計算ロジック） |
| `current_state` | jsonb | 全プレイヤーの現在スコア |
| `created_at` | timestamp | |

### 1.2 profiles (ユーザー/端末情報)
匿名認証で生成されたユーザー情報。

| Column | Type | Note |
|:---|:---|:---|
| `id` | uuid | Supabase Auth ID (PK) |
| `display_name` | text | ニックネーム |
| `current_room_id` | uuid | 参加中のルーム (FK: rooms.id) |

## 2. JSON構造 (jsonbカラムの中身)

### template (定義)
親機が設定する「ゲームのルール」。
```json
{
  "variables": [
    { "key": "score", "label": "点数", "initial": 25000 },
    { "key": "coins", "label": "コイン", "initial": 0 }
  ],
  "actions": [
    { "label": "リーチ", "calc": "score - 1000" }
  ]
}
```

### current_state (値)
全プレイヤーの現在の値。`template` の `variables` で定義されたキーを持つ。
```json
{
  "user_uuid_A": {
    "score": 24000,
    "coins": 0,
    "_status": "ready" 
  },
  "user_uuid_B": {
    "score": 25000,
    "coins": 0,
    "_status": "thinking"
  }
}
```
※ `_` (アンダースコア) 始まりのキーは、テンプレートに依存しないシステム用ステータスとする。

## 3. セキュリティポリシー (RLS)
* **rooms:** `room_code` を知っているユーザーは `SELECT` (参照) 可能。
* **update:** 参加者は `current_state` カラムを `UPDATE` 可能（またはPostgres Function経由で更新）。
