import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "../contexts/AuthContext";
import { useAuth } from "../hooks/useAuth";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

/**
 * Auth Guard コンポーネント
 * 認証状態に基づいてリダイレクトを制御
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading, signInAnonymously } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // loading中はリダイレクトしない
    if (loading) return;
    // profileLoading中、またはuserがあるのにprofileがnull（取得中）の場合はリダイレクトしない
    if (profileLoading || (user && !profile)) return;

    const inAuthGroup = segments[0] === "(auth)";

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
  }, [user, profile, loading, profileLoading, segments]);

  // ローディング中の表示（プロファイル取得中も含む）
  if (loading || profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // 認証失敗時のリトライ画面
  if (!loading && !user) {
    const handleRetry = async () => {
      setRetrying(true);
      try {
        await signInAnonymously();
      } catch (e) {
        console.error("リトライ失敗:", e);
      } finally {
        setRetrying(false);
      }
    };

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>接続できませんでした</Text>
        <Text style={styles.errorMessage}>
          ネットワーク接続を確認して{"\n"}もう一度お試しください
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={handleRetry}
          disabled={retrying}
          activeOpacity={0.8}
        >
          {retrying ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.retryButtonText}>再試行</Text>
          )}
        </TouchableOpacity>
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
          >
            <Stack.Screen
              name="game/[id]"
              options={{ gestureEnabled: false }}
            />
          </Stack>
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#374151",
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  retryButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: "center",
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
