# 依存関係リスト

## 📦 インストール済み依存関係 (Production)

### Supabase 関連

```json
{
  "@supabase/supabase-js": "^2.89.0",
  "@react-native-async-storage/async-storage": "^2.2.0",
  "react-native-url-polyfill": "^3.0.0"
}
```

**説明:**

- **@supabase/supabase-js**: Supabase JavaScript クライアント。データベース操作、認証、Realtime 機能を提供
- **@react-native-async-storage/async-storage**: React Native 用のキーバリューストレージ。Supabase のセッション永続化に使用
- **react-native-url-polyfill**: React Native 環境で URL API を使用可能にする polyfill

### ナビゲーション (expo-router)

```json
{
  "expo-router": "^6.0.21",
  "expo-linking": "^8.0.11",
  "expo-constants": "^18.0.12",
  "expo-status-bar": "~3.0.9",
  "react-native-screens": "~4.16.0",
  "react-native-safe-area-context": "^5.6.2"
}
```

**説明:**

- **expo-router**: Expo 用のファイルベースルーティングライブラリ
- **expo-linking**: ディープリンクと URL スキームのサポート
- **expo-constants**: アプリの定数とマニフェスト情報へのアクセス
- **expo-status-bar**: ステータスバーのカスタマイズ
- **react-native-screens**: ネイティブナビゲーションのパフォーマンス最適化
- **react-native-safe-area-context**: セーフエリア (ノッチ対応) のサポート

### アニメーション・UI

```json
{
  "react-native-reanimated": "~4.1.1",
  "react-native-worklets-core": "^1.6.2",
  "react-native-worklets": "^3.1.0"
}
```

**説明:**

- **react-native-reanimated**: 高性能なアニメーションライブラリ
- **react-native-worklets-core**: Worklets API のコア機能
- **react-native-worklets**: Reanimated の依存関係

### スタイリング (将来的に使用予定)

```json
{
  "nativewind": "^4.2.1",
  "tailwindcss": "^4.1.18"
}
```

**説明:**

- **nativewind**: React Native 用の Tailwind CSS 実装（現在は互換性の問題により未使用）
- **tailwindcss**: ユーティリティファーストの CSS フレームワーク

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

### ✅ 実際に実行したセットアップ

```bash
cd app

# Supabase関連
npm install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill

# expo-router関連
npm install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar

# アニメーション・Worklets（互換性のため）
npm install react-native-reanimated react-native-worklets-core react-native-worklets --legacy-peer-deps

# 開発依存関係
npm install --save-dev babel-preset-expo @types/react typescript
```

### 注意事項

- `--legacy-peer-deps`フラグは、パッケージ間の依存関係の競合を回避するために使用
- NativeWind は互換性の問題により、現在は React Native 標準の StyleSheet を使用

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

## 📝 実際の package.json

セットアップ完了後の [`package.json`](app/package.json) は以下のようになっています：

```json
{
  "name": "app",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "^2.2.0",
    "@supabase/supabase-js": "^2.89.0",
    "expo": "~54.0.30",
    "expo-constants": "^18.0.12",
    "expo-linking": "^8.0.11",
    "expo-router": "^6.0.21",
    "expo-status-bar": "~3.0.9",
    "nativewind": "^4.2.1",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "^5.6.2",
    "react-native-screens": "~4.16.0",
    "react-native-url-polyfill": "^3.0.0",
    "react-native-worklets-core": "^1.6.2",
    "react-native-worklets": "^3.1.0",
    "tailwindcss": "^4.1.18"
  },
  "devDependencies": {
    "@types/react": "~19.1.0",
    "babel-preset-expo": "^54.0.9",
    "typescript": "~5.9.2"
  },
  "private": true
}
```

**重要な変更点:**

- `main`エントリーポイントを`expo-router/entry`に変更
- Expo SDK 54 を使用
- React 19.1.0 を使用
- expo-router によるファイルベースルーティング

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
