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
   * 初期化：セッションの確認と復元
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // 既存のセッションを確認
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

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
          // セッションがない場合は匿名ログインを実行
          await signInAnonymously();
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
        const profileData = await fetchProfile(currentSession.user.id);
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
   */
  const signInAnonymously = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInAnonymously();

      if (error) {
        console.error("匿名ログインエラー:", error);
        throw error;
      }

      if (data.user) {
        setUser(data.user);
        setSession(data.session);

        // プロファイルを取得（トリガーで自動作成されている）
        const profileData = await fetchProfile(data.user.id);
        setProfile(profileData);
      }
    } catch (error) {
      console.error("匿名ログイン例外:", error);
      throw error;
    } finally {
      setLoading(false);
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
