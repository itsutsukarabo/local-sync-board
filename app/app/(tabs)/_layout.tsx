import { Stack } from "expo-router";

/**
 * タブグループのレイアウト
 * 認証後の画面（ホーム、部屋作成、部屋参加など）
 */
export default function TabsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#ffffff" },
      }}
    />
  );
}
