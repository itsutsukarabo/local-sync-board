import React, { createContext, useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  User,
  Profile,
  AuthSession,
  AuthContextType,
  ProfileUpdate,
} from "../types";

/**
 * 認証コンテキスト
 * アプリ全体で認証状態を共有
 */
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

/**
 * 認証プロバイダー
 * 子コンポーネントに認証状態を提供
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * プロファイルをSupabaseから取得
   */
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("プロファイル取得エラー:", error);
        return null;
      }

      return data as Profile;
    } catch (error) {
      console.error("プロファイル取得例外:", error);
      return null;
    }
  };

  /**
   * プロファイルをリトライ付きで取得
   * 匿名ログイン直後はDBトリガーによるprofile自動作成が遅延する場合があるため
   */
  const fetchProfileWithRetry = async (
    userId: string,
    maxRetries = 3
  ): Promise<Profile | null> => {
    for (let i = 0; i < maxRetries; i++) {
      const profileData = await fetchProfile(userId);
      if (profileData) return profileData;
      // トリガーによるprofile作成を待つ（500ms, 1000ms, 1500ms）
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
    return null;
  };

  /**
   * 初期化：セッションの確認と復元
   */
  useEffect(() => {
    let mounted = true;
    const AUTH_TIMEOUT_MS = 10000;

    /** タイムアウト付きPromiseラッパー */
    const withTimeout = <T,>(
      promise: Promise<T>,
      ms: number,
      label: string
    ): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} タイムアウト (${ms}ms)`)), ms)
        ),
      ]);

    const initializeAuth = async () => {
      try {
        // 既存のセッションを確認（タイムアウト付き）
        const {
          data: { session: currentSession },
        } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          "セッション取得"
        );

        if (!mounted) return;

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);

          // プロファイルを取得
          const profileData = await fetchProfile(currentSession.user.id);
          if (mounted) {
            setProfile(profileData);
          }
        } else {
          // セッションがない場合は匿名ログインを実行（タイムアウト付き）
          const { data, error } = await withTimeout(
            supabase.auth.signInAnonymously(),
            AUTH_TIMEOUT_MS,
            "匿名ログイン"
          );

          if (error) throw error;
          if (!mounted) return;

          if (data.user) {
            setUser(data.user);
            setSession(data.session);

            // リトライ付きでプロファイルを取得（トリガー遅延対策）
            const profileData = await fetchProfileWithRetry(data.user.id);
            if (mounted) {
              setProfile(profileData);
            }
          }
        }
      } catch (error) {
        console.error("認証初期化エラー:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // 認証状態の変更を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!mounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        const profileData = await fetchProfileWithRetry(currentSession.user.id);
        if (mounted) {
          setProfile(profileData);
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * 匿名ログイン
   * 注: loading制御は呼び出し元(initializeAuth)が管理する
   */
  const signInAnonymously = async () => {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      console.error("匿名ログインエラー:", error);
      throw error;
    }

    if (data.user) {
      setUser(data.user);
      setSession(data.session);

      // リトライ付きでプロファイルを取得（トリガー遅延対策）
      const profileData = await fetchProfileWithRetry(data.user.id);
      setProfile(profileData);
    }
  };

  /**
   * プロファイル更新
   */
  const updateProfile = async (data: ProfileUpdate) => {
    if (!user) {
      throw new Error("ユーザーが認証されていません");
    }

    try {
      const { data: updatedProfile, error } = await supabase
        .from("profiles")
        .update(data)
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        console.error("プロファイル更新エラー:", error);
        throw error;
      }

      setProfile(updatedProfile as Profile);
    } catch (error) {
      console.error("プロファイル更新例外:", error);
      throw error;
    }
  };

  /**
   * サインアウト
   */
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("サインアウトエラー:", error);
        throw error;
      }

      setUser(null);
      setProfile(null);
      setSession(null);
    } catch (error) {
      console.error("サインアウト例外:", error);
      throw error;
    }
  };

  // メモ化してパフォーマンス最適化
  const value = useMemo(
    () => ({
      user,
      profile,
      session,
      loading,
      signInAnonymously,
      updateProfile,
      signOut,
    }),
    [user, profile, session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
