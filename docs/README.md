# Local Sync Board (Cloud Edition)

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
