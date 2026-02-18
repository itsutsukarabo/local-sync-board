import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
  // app/tsconfig.json が "extends": "expo/tsconfig.base" を持つが、
  // CI の root node_modules には expo が無い。
  // tsconfigRaw を JSON **文字列** で渡すと TSConfck のファイル解決を完全にバイパスできる。
  // （オブジェクト形式だと Vite はファイルも読みに行きマージするため回避にならない）
  esbuild: {
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }),
  },
  resolve: {
    alias: {
      // app/node_modules/react (19.1.0) と node_modules/react (19.2.4) の重複を解消。
      // react-dom と同一インスタンスを使わないと "Invalid hook call" になる。
      react: path.resolve(__dirname, "node_modules/react"),
      // Vite/Rollup が react-native の Flow 構文をパースできないため、
      // hook テスト用のスタブモジュールにリダイレクト。
      // 既存の Supabase 統合テストは react-native を import しないため影響なし。
      "react-native": path.resolve(__dirname, "tests/__mocks__/react-native.ts"),
      "expo-haptics": path.resolve(__dirname, "tests/__mocks__/expo-haptics.ts"),
      // CI の root node_modules に存在しない React Native 関連パッケージのスタブ
      "react-native-url-polyfill/auto": path.resolve(
        __dirname,
        "tests/__mocks__/react-native-url-polyfill-auto.ts",
      ),
      "@react-native-async-storage/async-storage": path.resolve(
        __dirname,
        "tests/__mocks__/async-storage.ts",
      ),
    },
  },
});
