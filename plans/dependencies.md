# 依存関係リスト

## 📦 必須依存関係 (Production)

### Supabase 関連

```json
{
  "@supabase/supabase-js": "^2.39.0",
  "@react-native-async-storage/async-storage": "^1.21.0",
  "react-native-url-polyfill": "^2.0.0"
}
```

**説明:**

- **@supabase/supabase-js**: Supabase JavaScript クライアント。データベース操作、認証、Realtime 機能を提供
- **@react-native-async-storage/async-storage**: React Native 用のキーバリューストレージ。Supabase のセッション永続化に使用
- **react-native-url-polyfill**: React Native 環境で URL API を使用可能にする polyfill

### ナビゲーション (推奨)

```json
{
  "@react-navigation/native": "^6.1.9",
  "@react-navigation/native-stack": "^6.9.17",
  "react-native-screens": "^3.29.0",
  "react-native-safe-area-context": "^4.8.2"
}
```

**説明:**

- **@react-navigation/native**: React Native 用のルーティング・ナビゲーションライブラリ
- **@react-navigation/native-stack**: ネイティブスタックナビゲーター
- **react-native-screens**: ネイティブナビゲーションのパフォーマンス最適化
- **react-native-safe-area-context**: セーフエリア (ノッチ対応) のサポート

### UI ライブラリ (オプション)

```json
{
  "react-native-paper": "^5.11.6"
}
```

**説明:**

- **react-native-paper**: Material Design ベースの UI コンポーネントライブラリ

### QR コード機能 (後で追加)

```json
{
  "expo-camera": "~14.0.0",
  "react-native-qrcode-svg": "^6.2.0"
}
```

**説明:**

- **expo-camera**: カメラアクセス (QR コードスキャン用)
- **react-native-qrcode-svg**: QR コード生成

## 🛠️ 開発依存関係 (Development)

```json
{
  "@types/react": "~18.2.45",
  "@types/react-native": "^0.72.8",
  "typescript": "^5.3.3"
}
```

**説明:**

- TypeScript 型定義ファイル
- 開発時の型チェックとインテリセンスに使用

## 📋 インストールコマンド

### 基本セットアップ (最小構成)

```bash
cd app
npm install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

### 推奨セットアップ (ナビゲーション含む)

```bash
cd app
npm install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-screens react-native-safe-area-context
```

### フルセットアップ (UI ライブラリ含む)

```bash
cd app
npm install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-screens react-native-safe-area-context
npm install react-native-paper
```

### 開発依存関係

```bash
npm install --save-dev @types/react @types/react-native
```

## 🔄 後で追加する可能性のある依存関係

### 状態管理

```json
{
  "@tanstack/react-query": "^5.17.0",
  "zustand": "^4.4.7"
}
```

### フォーム管理

```json
{
  "react-hook-form": "^7.49.2"
}
```

### ユーティリティ

```json
{
  "date-fns": "^3.0.6",
  "uuid": "^9.0.1",
  "@types/uuid": "^9.0.7"
}
```

### テスト

```json
{
  "@testing-library/react-native": "^12.4.2",
  "jest": "^29.7.0"
}
```

## 📝 package.json の例

セットアップ完了後の [`package.json`](app/package.json) は以下のようになります：

```json
{
  "name": "local-sync-board",
  "version": "1.0.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~50.0.0",
    "expo-status-bar": "~1.11.1",
    "react": "18.2.0",
    "react-native": "0.73.0",
    "@supabase/supabase-js": "^2.39.0",
    "@react-native-async-storage/async-storage": "^1.21.0",
    "react-native-url-polyfill": "^2.0.0",
    "@react-navigation/native": "^6.1.9",
    "@react-navigation/native-stack": "^6.9.17",
    "react-native-screens": "^3.29.0",
    "react-native-safe-area-context": "^4.8.2",
    "react-native-paper": "^5.11.6"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0",
    "@types/react": "~18.2.45",
    "@types/react-native": "^0.72.8",
    "typescript": "^5.3.3"
  },
  "private": true
}
```

## ⚠️ 注意事項

1. **Expo SDK バージョン**: Expo のバージョンによって互換性のあるパッケージバージョンが異なります
2. **React Native バージョン**: Expo SDK に含まれる React Native のバージョンに依存します
3. **ネイティブモジュール**: 一部のパッケージは Expo Go では動作せず、開発ビルドが必要になる場合があります

## 🔍 バージョン確認

インストール後、以下のコマンドでバージョンを確認できます：

```bash
cd app
npm list @supabase/supabase-js
npm list react-native
npx expo --version
```

## 📚 参考リンク

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [React Native Paper](https://callstack.github.io/react-native-paper/)
