import React, {
  createContext,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
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
  const [profileLoading, setProfileLoading] = useState(false);

  // デバッグ用ログ（通常は無効化。調査時に console.log に切り替え）
  const mountTimeRef = useRef(Date.now());
  const dbg = (_msg: string, ..._args: unknown[]) => {};

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
   *
   * 注意: getSession() はトークン更新時にPromiseが解決されないバグがあるため、
   * onAuthStateChange で取得したセッションをフォールバックとして使用する。
   */
  useEffect(() => {
    let mounted = true;
    const AUTH_TIMEOUT_MS = 10000;

    // onAuthStateChange で取得したセッションを記録（getSession タイムアウト時のフォールバック用）
    let authStateSession: AuthSession | null = null;
    let authStateResolved = false;
    let loadingResolved = false; // loading解除済みフラグ（二重解除防止）

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
      dbg("initializeAuth START");
      try {
        // 既存のセッションを確認（タイムアウト付き）
        dbg("getSession START");
        const {
          data: { session: currentSession },
        } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          "セッション取得"
        );
        dbg("getSession END, hasSession:", !!currentSession, "hasUser:", !!currentSession?.user);

        if (!mounted) return;

        if (currentSession?.user) {
          dbg("setUser/setSession from getSession");
          setSession(currentSession);
          setUser(currentSession.user);

          // プロファイルを取得（タイムアウト付き）
          try {
            const profileData = await withTimeout(
              fetchProfile(currentSession.user.id),
              AUTH_TIMEOUT_MS,
              "プロファイル取得(init)"
            );
            if (mounted) setProfile(profileData);
          } catch (e) {
            dbg("initializeAuth: profile fetch failed/timeout:", e);
            if (mounted) setProfile(null);
          }
        } else {
          // セッションがない場合は匿名ログインを実行（タイムアウト付き）
          dbg("signInAnonymously START");
          const { data, error } = await withTimeout(
            supabase.auth.signInAnonymously(),
            AUTH_TIMEOUT_MS,
            "匿名ログイン"
          );
          dbg("signInAnonymously END, hasUser:", !!data?.user, "hasError:", !!error);

          if (error) throw error;
          if (!mounted) return;

          if (data.user) {
            setUser(data.user);
            setSession(data.session);

            // リトライ付きでプロファイルを取得（トリガー遅延対策、タイムアウト付き）
            try {
              const profileData = await withTimeout(
                fetchProfileWithRetry(data.user.id),
                AUTH_TIMEOUT_MS,
                "プロファイル取得(anon)"
              );
              if (mounted) setProfile(profileData);
            } catch (e) {
              dbg("initializeAuth: profile fetch after anon login failed/timeout:", e);
              if (mounted) setProfile(null);
            }
          }
        }
      } catch (error) {
        dbg("initializeAuth CATCH:", error);

        // getSession タイムアウト時、onAuthStateChange で既にセッションが取得されていればOK
        if (authStateResolved && authStateSession?.user) {
          dbg("Fallback: using session from onAuthStateChange");
          // onAuthStateChange で既に setUser/setSession/setProfile が呼ばれているので、
          // ここでは何もしない（正常終了扱い）
        } else {
          // 本当にセッションがない場合のみエラーログ
          console.error("認証初期化エラー:", error);
        }
      } finally {
        if (mounted && !loadingResolved) {
          loadingResolved = true;
          dbg("initializeAuth FINALLY → setLoading(false)");
          setLoading(false);
        } else {
          dbg("initializeAuth FINALLY → loading already resolved");
        }
      }
    };

    initializeAuth();

    dbg("initializeAuth called (async), setting up onAuthStateChange");

    // 認証状態の変更を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      dbg("onAuthStateChange fired, event:", event, "hasSession:", !!currentSession, "hasUser:", !!currentSession?.user);

      // getSession タイムアウト時のフォールバック用に記録
      authStateSession = currentSession;
      authStateResolved = true;

      if (!mounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        // プロファイル取得開始前にprofileLoadingをtrueに（リダイレクト防止）
        setProfileLoading(true);

        // セッション確認できた時点でloading解除（プロファイル取得を待たない）
        if (!loadingResolved) {
          loadingResolved = true;
          dbg("onAuthStateChange: setLoading(false) - session ready, profileLoading=true");
          setLoading(false);
        }

        // プロファイル取得は排他ロック外で実行（デッドロック防止）
        // onAuthStateChangeコールバックは auth-js の排他ロック内で呼ばれるため、
        // コールバック内で supabase.from().select() を呼ぶと getSession() が
        // 同じロックを取得しようとしてデッドロックする。
        // setTimeout(0) でコールバックを抜けてからDB問い合わせを行う。
        const userId = currentSession.user.id;
        setTimeout(async () => {
          dbg("onAuthStateChange: fetching profile for user (deferred)", userId);
          try {
            const profileData = await withTimeout(
              fetchProfileWithRetry(userId),
              AUTH_TIMEOUT_MS,
              "プロファイル取得"
            );
            dbg("onAuthStateChange: profile fetched, hasProfile:", !!profileData, "displayName:", profileData?.display_name);
            if (mounted) {
              setProfile(profileData);
              setProfileLoading(false);
            }
          } catch (profileError) {
            dbg("onAuthStateChange: profile fetch failed/timeout:", profileError);
            if (mounted) {
              setProfile(null);
              setProfileLoading(false);
            }
          }
        }, 0);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => {
      dbg("cleanup: unsubscribing");
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
      profileLoading,
      signInAnonymously,
      updateProfile,
      signOut,
    }),
    [user, profile, session, loading, profileLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
