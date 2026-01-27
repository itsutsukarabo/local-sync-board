# Phase 3: 開発ビルド作成ガイド

## 🎯 なぜ開発ビルドが必要か

Phase 3 で実装したドラッグ＆ドロップ機能は、`react-native-gesture-handler`と`react-native-reanimated`を使用しています。

これらのライブラリはネイティブコードを含むため、**Expo Go では正しく動作しません**。開発ビルドを作成する必要があります。

## 📋 前提条件

### Android の場合

- Android Studio がインストールされている
- Android SDK がセットアップされている
- Android エミュレータまたは実機

### iOS の場合（Mac のみ）

- Xcode がインストールされている
- iOS シミュレータまたは実機

## 🚀 開発ビルドの作成手順

### ステップ 1: EAS CLI のインストール

```bash
npm install -g eas-cli
```

### ステップ 2: Expo アカウントでログイン

```bash
cd app
eas login
```

### ステップ 3: プロジェクトの設定

```bash
eas build:configure
```

これにより `eas.json` ファイルが作成されます。

### ステップ 4: 開発ビルドの作成

#### Android の場合

```bash
eas build --profile development --platform android
```

#### iOS の場合（Mac のみ）

```bash
eas build --profile development --platform ios
```

### ステップ 5: ビルドの待機

ビルドには 10〜30 分かかります。完了すると、ダウンロードリンクが表示されます。

### ステップ 6: ビルドのインストール

#### Android

1. ダウンロードした `.apk` ファイルをデバイスにインストール
2. または、QR コードをスキャンしてインストール

#### iOS

1. ダウンロードした `.ipa` ファイルをシミュレータにインストール
2. または、TestFlight を使用して実機にインストール

### ステップ 7: 開発サーバーの起動

```bash
cd app
npx expo start --dev-client
```

### ステップ 8: アプリの起動

インストールした開発ビルドアプリを起動し、開発サーバーに接続します。

## 🔧 ローカル開発ビルド（より速い方法）

EAS を使わずに、ローカルでビルドすることもできます：

### Android（ローカル）

```bash
cd app
npx expo run:android
```

**前提条件:**

- Android Studio がインストールされている
- `ANDROID_HOME` 環境変数が設定されている

### iOS（ローカル・Mac のみ）

```bash
cd app
npx expo run:ios
```

**前提条件:**

- Xcode がインストールされている
- CocoaPods がインストールされている

## ✅ 動作確認

開発ビルドが正常に動作すると：

1. アプリが起動する
2. エラーなく画面が表示される
3. 麻雀テンプレートでルームを作成
4. 緑色の麻雀卓が表示される
5. **ドラッグ＆ドロップが動作する**

## 🐛 トラブルシューティング

### 問題 1: EAS CLI がインストールできない

```bash
# 管理者権限で実行
sudo npm install -g eas-cli
```

### 問題 2: ビルドが失敗する

- `eas.json` の設定を確認
- `app.json` の設定を確認
- EAS のビルドログを確認

### 問題 3: Android Studio が見つからない

環境変数を設定：

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 問題 4: ローカルビルドが遅い

初回ビルドは時間がかかります（10〜30 分）。2 回目以降は高速化されます。

## 📊 ビルド時間の目安

| 方法                | 初回      | 2 回目以降 |
| ------------------- | --------- | ---------- |
| EAS（クラウド）     | 10〜30 分 | 10〜30 分  |
| ローカル（Android） | 10〜20 分 | 2〜5 分    |
| ローカル（iOS）     | 15〜30 分 | 3〜7 分    |

## 🎉 開発ビルド完成後

開発ビルドが完成したら、以下の機能が使えるようになります：

✅ ドラッグ＆ドロップによる点数移動
✅ 滑らかなアニメーション
✅ 麻雀モードの完全な機能
✅ リアルタイム同期

## 📝 注意事項

### Expo Go との違い

| 機能                 | Expo Go  | 開発ビルド                         |
| -------------------- | -------- | ---------------------------------- |
| 起動速度             | 速い     | 普通                               |
| ネイティブモジュール | 制限あり | 全て使える                         |
| ビルド時間           | 不要     | 必要                               |
| 更新                 | 即座     | 再ビルド必要（コード変更時は不要） |

### 開発ビルドの更新

JavaScript コードの変更は、開発サーバーを再起動するだけで反映されます。

ネイティブコード（`app.json`、ネイティブモジュールの追加など）を変更した場合のみ、再ビルドが必要です。

## 🔗 参考リンク

- [Expo Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
- [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/)

---

**作成日:** 2026-01-10
**対象:** Phase 3 実装の開発ビルド作成
