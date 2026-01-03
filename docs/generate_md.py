import zipfile
import os

# チャット上での表示崩れを防ぐため、バッククォートを変数で定義します
BQ = "```"

files_content = {
    "README.md": f"""# Local Sync Board (Cloud Edition)

## 🎯 プロジェクト概要
アナログゲーム（麻雀、ボードゲーム等）の「点数・変数管理」を、スマートフォン同士でリアルタイムに同期するサポートアプリです。
Supabase (BaaS) をバックエンドに採用し、QRコードやルームIDによる手軽なマルチプレイ環境を提供します。

## ✨ 特徴
1. **クラウドリアルタイム同期:** インターネット経由で、遅延なく全員のスコアが同期されます。
2. **Master-Clientモデル:**
    * **親機:** ルーム作成、ゲームのルール（計算式・UI）定義。
    * **子機:** ルームに参加し、自分のスコアを操作。
3. **柔軟なテンプレート:** 麻雀、人生ゲームなど、ゲームに合わせた「ボード」を自由に作成・保存可能。

## 🛠 技術スタック
* **Frontend:** React Native (Expo) / TypeScript
* **Backend:** Supabase (PostgreSQL / Realtime)
* **Auth:** Supabase Auth (Anonymous Login / 匿名認証)
* **State Management:** React Query or Context API
""",

    "01_Requirements.md": f"""# 要件定義書 (System Requirements Specification)

## 1. システムの目的
複数のスマートフォン間で、ゲームの進行状況（スコア、ステータス）をインターネット経由でリアルタイム共有する。

## 2. スコープ定義

### 2.1 In Scope (対象範囲)
* **インターネット通信:** Wi-Fi または モバイルデータ通信を利用。
* **ルーム管理:**
    * 親機によるルーム作成（Room ID生成）。
    * 子機によるRoom ID入力（またはQR読み取り）での参加。
* **ボード作成 (Builder):** 親機によるUI配置、変数定義、計算ロジックの定義。
* **リアルタイム同期:** Supabase Realtimeを利用したミリ秒単位の状態反映。
* **匿名利用:** アカウント登録不要で、アプリを開けばすぐ使える（匿名認証）。

### 2.2 Out of Scope (対象外)
* **完全オフライン動作:** 圏外では動作しない（エラー表示を行う）。
* **複雑な権限管理:** ルーム内のユーザーは善意のプレイヤーであると仮定し、厳密なチート対策は行わない。
* **過去ログの永続保存:** ゲーム終了後、一定期間でルームデータは削除される（エフェメラルな利用）。

## 3. 機能要件 (Functional Requirements)

* **[FR-01] ルーム作成と接続:**
    * 親機はユニークな「Room ID」を発行する。
    * 子機はそのIDを入力することで、特定のセッション（DBの行）を購読(Subscribe)する。
* **[FR-02] ボードテンプレート:**
    * 親機は「麻雀用」「ボードゲーム用」などの設定をJSON形式でDBに保存し、呼び出せること。
* **[FR-03] 状態同期:**
    * 誰かが数値を更新したら、即座に全員の画面に反映されること（Supabase Realtime）。
* **[FR-04] データ永続化:**
    * アプリをタスクキルしても、サーバー上にデータがある限り復帰できること。
""",

    "02_Basic_Design.md": f"""# 基本設計書 (Basic Design - UI/UX)

## 1. 画面フロー

| ID | 画面名 | 役割 | 備考 |
|:---|:---|:---|:---|
| **S-01** | **Home / Lobby** | スタート画面 | 親機：「部屋を作る」 / 子機：「部屋に入る」 |
| **S-02** | **Game Board** | メイン画面 | 全員のスコア表示。ここからアクション(S-03)へ。 |
| **S-03** | **Action Modal** | 入力パネル | 数値入力、アクション実行（モーダル表示）。 |
| **S-04** | **Builder / Settings** | 設定画面 | 親機専用。レイアウト編集、リセット操作。 |

## 2. 詳細UX

### S-01: Home / Lobby
* シンプルな2択ボタンを表示。
* **Join (子機):** 4桁〜6桁のルームID入力フォーム、またはカメラ起動ボタン（QR用）。
* **Create (親機):** 新規作成ボタン。押下時にSupabaseにレコードを作成し、S-02へ遷移。

### S-02: Game Board
* Supabaseからの変更通知を受け取り、自動で再描画される。
* ヘッダーに「Room ID」を表示し、タップでコピー/QR表示可能にする。

### S-04: Builder (親機のみ)
* プリセット（麻雀など）の選択リスト。
* 「変数の追加」「ボタンの追加」を行い、DBの `template` カラムを更新する。
""",

    "03_Data_Model.md": f"""# データモデル設計書 (Supabase Schema)

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
{BQ}json
{{
  "variables": [
    {{ "key": "score", "label": "点数", "initial": 25000 }},
    {{ "key": "coins", "label": "コイン", "initial": 0 }}
  ],
  "actions": [
    {{ "label": "リーチ", "calc": "score - 1000" }}
  ]
}}
{BQ}

### current_state (値)
全プレイヤーの現在の値。`template` の `variables` で定義されたキーを持つ。
{BQ}json
{{
  "user_uuid_A": {{
    "score": 24000,
    "coins": 0,
    "_status": "ready" 
  }},
  "user_uuid_B": {{
    "score": 25000,
    "coins": 0,
    "_status": "thinking"
  }}
}}
{BQ}
※ `_` (アンダースコア) 始まりのキーは、テンプレートに依存しないシステム用ステータスとする。

## 3. セキュリティポリシー (RLS)
* **rooms:** `room_code` を知っているユーザーは `SELECT` (参照) 可能。
* **update:** 参加者は `current_state` カラムを `UPDATE` 可能（またはPostgres Function経由で更新）。
""",

    "04_Tech_Architecture.md": f"""# 技術構成書 (Technical Architecture)

## 1. 技術選定理由
* **Platform:** React Native (Expo)
    * iOS/Android両対応、開発速度が速い。
* **Backend:** Supabase
    * **Database:** PostgreSQL (堅牢なデータ管理)。
    * **Realtime:** DBの変更をWebSocketで即座にクライアントへPushする機能が標準装備されており、自前でのSocket実装が不要。
    * **Auth:** 匿名認証 (Anonymous Login) が標準で使え、面倒な登録フォームを作らなくて良い。

## 2. 同期フロー (Sync Strategy)

1. **Change:** ユーザーがボタンを押す。
2. **Update:** クライアントが Supabase JS SDK を使い、`rooms` テーブルの `current_state` を更新する。
3. **Broadcast:** Supabase が変更を検知し、同じルームを購読している全端末へパッチを配信。
4. **Reflect:** 各端末の画面が自動更新される。

## 3. オフライン/エラーハンドリング
* 通信切断時は、画面に「接続中...」のトーストを表示し、操作をブロックする（不整合防止）。
* 再接続時に最新の `current_state` をフェッチし、同期し直す。
"""
}

# Zipファイルの作成
zip_filename = "Local_Sync_Board_Cloud_Docs.zip"
print(f"Creating {zip_filename}...")

with zipfile.ZipFile(zip_filename, 'w') as zipf:
    for filename, content in files_content.items():
        zipf.writestr(filename, content)
        print(f" - Added: {filename}")

print(f"Done! '{zip_filename}' has been created.")