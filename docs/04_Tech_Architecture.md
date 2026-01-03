# 技術構成書 (Technical Architecture)

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
