# Local Sync Board - Mobile App

React Native (Expo) + TypeScript + Supabase で構築されたリアルタイム同期ボードゲームアプリ

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` ファイルを作成し、Supabase の設定を記入してください。

```bash
cp .env.example .env
```

`.env` ファイルを編集:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Supabase プロジェクトのセットアップ

1. [Supabase](https://supabase.com) でプロジェクトを作成
2. データベーススキーマを作成 (詳細は [`../docs/03_Data_Model.md`](../docs/03_Data_Model.md) を参照)
3. RLS (Row Level Security) ポリシーを設定
4. Realtime を有効化

### 4. 開発サーバーの起動

```bash
npm start
```

または、特定のプラットフォームで起動:

```bash
npm run ios      # iOS シミュレータ
npm run android  # Android エミュレータ
npm run web      # Web ブラウザ
```

## 📁 プロジェクト構造

```
app/
├── App.tsx                 # エントリーポイント
├── app.json                # Expo 設定
├── package.json            # 依存関係
├── tsconfig.json           # TypeScript 設定
├── .env.example            # 環境変数テンプレート
│
├── lib/                    # ライブラリ・設定
│   └── supabase.ts         # Supabase クライアント
│
├── types/                  # TypeScript 型定義
│   └── index.ts            # 共通型定義
│
├── screens/                # 画面コンポーネント
│   ├── WelcomeScreen.tsx
│   ├── HomeScreen.tsx
│   ├── CreateRoomScreen.tsx
│   ├── JoinRoomScreen.tsx
│   └── GameScreen.tsx
│
├── components/             # 再利用可能なコンポーネント
│   ├── common/             # 汎用コンポーネント
│   ├── room/               # ルーム関連コンポーネント
│   └── game/               # ゲーム関連コンポーネント
│
├── hooks/                  # カスタムフック
│   ├── useAuth.ts
│   ├── useRealtimeRoom.ts
│   └── useRoomState.ts
│
├── contexts/               # Context API
│   └── AuthContext.tsx
│
└── utils/                  # ユーティリティ関数
    └── calculations.ts
```

## 🛠️ 技術スタック

- **Frontend**: React Native (Expo SDK)
- **Language**: TypeScript
- **Backend**: Supabase (PostgreSQL + Realtime)
- **Authentication**: Supabase Auth (Anonymous Login)
- **Storage**: AsyncStorage (セッション永続化)

## 📦 主要な依存関係

- `expo` - React Native フレームワーク
- `@supabase/supabase-js` - Supabase クライアント
- `@react-native-async-storage/async-storage` - ローカルストレージ
- `react-native-url-polyfill` - URL API polyfill

## 🔧 開発コマンド

```bash
# 開発サーバー起動
npm start

# iOS シミュレータで起動
npm run ios

# Android エミュレータで起動
npm run android

# Web ブラウザで起動
npm run web

# TypeScript 型チェック
npx tsc --noEmit

# キャッシュクリア
npx expo start --clear
```

## 📝 TypeScript パスエイリアス

インポートを簡潔にするため、以下のパスエイリアスが設定されています:

```typescript
import { supabase } from "@lib/supabase";
import { Room } from "@types/index";
import HomeScreen from "@screens/HomeScreen";
import Button from "@components/common/Button";
import { useAuth } from "@hooks/useAuth";
```

## 🔐 環境変数

| 変数名                          | 説明                        |
| ------------------------------- | --------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase プロジェクトの URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase の Anon Key        |

**注意**: `EXPO_PUBLIC_` プレフィックスが付いた環境変数のみがクライアント側で利用可能です。

## 📚 ドキュメント

- [要件定義](../docs/01_Requirements.md)
- [基本設計](../docs/02_Basic_Design.md)
- [データモデル](../docs/03_Data_Model.md)
- [技術構成](../docs/04_Tech_Architecture.md)
- [実装計画](../plans/README.md)

## 🐛 トラブルシューティング

### Metro Bundler のキャッシュをクリア

```bash
npx expo start --clear
```

### node_modules を再インストール

```bash
rm -rf node_modules package-lock.json
npm install
```

### iOS シミュレータが起動しない

```bash
# Xcode Command Line Tools を確認
xcode-select --install
```

### Android エミュレータが起動しない

Android Studio がインストールされ、エミュレータが設定されているか確認してください。

## 📱 テスト環境

### Expo Go アプリ

基本的な開発には Expo Go アプリを使用できます:

1. iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
2. Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

### 開発ビルド

ネイティブモジュールを使用する場合は、開発ビルドが必要です:

```bash
npx expo install expo-dev-client
eas build --profile development --platform ios
eas build --profile development --platform android
```

## 🚀 デプロイ

### EAS Build を使用したビルド

```bash
# iOS
eas build --platform ios

# Android
eas build --platform android

# 両方
eas build --platform all
```

### EAS Submit を使用した配信

```bash
# App Store
eas submit --platform ios

# Google Play
eas submit --platform android
```

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。

## 🤝 コントリビューション

プルリクエストを歓迎します。大きな変更の場合は、まず Issue を開いて変更内容を議論してください。

## 📞 サポート

質問や問題がある場合は、GitHub Issues でお知らせください。
