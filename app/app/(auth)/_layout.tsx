import { Stack } from "expo-router";

/**
 * 認証グループのレイアウト
 * 認証前の画面（Welcome画面など）
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#ffffff" },
      }}
    />
  );
}
