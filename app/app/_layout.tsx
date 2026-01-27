import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "../contexts/AuthContext";
import { useAuth } from "../hooks/useAuth";
import { View, ActivityIndicator, StyleSheet } from "react-native";

/**
 * Auth Guard コンポーネント
 * 認証状態に基づいてリダイレクトを制御
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";

    // 認証状態に基づいてリダイレクト
    if (!user) {
      // 未認証の場合、認証グループ以外にいたらwelcomeへ
      if (!inAuthGroup) {
        router.replace("/(auth)/welcome");
      }
    } else if (user && !profile?.display_name) {
      // 認証済みだがニックネーム未設定の場合、welcomeへ
      if (!inAuthGroup) {
        router.replace("/(auth)/welcome");
      }
    } else if (user && profile?.display_name) {
      // 認証済みかつニックネーム設定済みの場合、認証グループにいたらホームへ
      if (inAuthGroup) {
        router.replace("/(tabs)/");
      }
    }
  }, [user, profile, loading, segments]);

  // ローディング中の表示
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * ルートレイアウト
 * アプリ全体のレイアウトと認証管理
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AuthGuard>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#ffffff" },
            }}
          />
        </AuthGuard>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
});
