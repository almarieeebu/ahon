"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

type AuthValue = {
  /** true once we know if user is logged in or using local-only mode */
  ready: boolean;
  /** Supabase configured via env? */
  cloudEnabled: boolean;
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  continueLocal: () => void;
  /** Leave local-only and show AuthScreen again */
  requestSignIn: () => void;
  /** local-only mode (no login) */
  localOnly: boolean;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cloudEnabled = isSupabaseConfigured();
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(!cloudEnabled);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Local-only = no cloud login. Default true only when Supabase env is missing.
  const [localOnly, setLocalOnly] = useState(!cloudEnabled);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      setLocalOnly(true);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      // Keep localOnly as-is (false) so AuthScreen shows when no session.
      if (data.session) setLocalOnly(false);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (next) setLocalOnly(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return "Supabase not configured";
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return error?.message ?? null;
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return "Supabase not configured";
      const { error } = await supabase.auth.signUp({ email, password });
      return error?.message ?? null;
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // Back to AuthScreen so user can sign in again (or continue local)
    setLocalOnly(false);
  }, [supabase]);

  const continueLocal = useCallback(() => {
    setLocalOnly(true);
  }, []);

  const requestSignIn = useCallback(() => {
    setLocalOnly(false);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      cloudEnabled,
      user,
      session,
      signIn,
      signUp,
      signOut,
      continueLocal,
      requestSignIn,
      localOnly,
    }),
    [
      ready,
      cloudEnabled,
      user,
      session,
      signIn,
      signUp,
      signOut,
      continueLocal,
      requestSignIn,
      localOnly,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
