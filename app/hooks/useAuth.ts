import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";
import { AuthContextType } from "../types";

/**
 * 認証カスタムフック
 * AuthContextを簡単に使用するためのヘルパー
 *
 * @example
 * ```tsx
 * const { user, profile, loading, updateProfile } = useAuth();
 *
 * if (loading) return <LoadingScreen />;
 * if (!user) return <LoginScreen />;
 *
 * return <HomeScreen user={user} profile={profile} />;
 * ```
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error(
      "useAuth must be used within an AuthProvider. " +
        "Wrap your app with <AuthProvider> in _layout.tsx"
    );
  }

  return context;
}
