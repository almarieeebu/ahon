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
  /** Email-confirm / OAuth redirect message (success or failure) */
  authNotice: string | null;
  clearAuthNotice: () => void;
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

function stripAuthParams() {
  const url = new URL(window.location.href);
  [
    "code",
    "error",
    "error_code",
    "error_description",
    "state",
    "token_hash",
    "type",
  ].forEach((key) => url.searchParams.delete(key));
  const next = url.pathname + url.search + url.hash;
  window.history.replaceState({}, "", next || "/");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cloudEnabled = isSupabaseConfigured();
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(!cloudEnabled);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // false until Sign in path or "continue local" — lets Landing show first
  const [localOnly, setLocalOnly] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    async function boot() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const errRaw =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error");

      if (errRaw) {
        const msg = decodeURIComponent(errRaw.replace(/\+/g, " "));
        if (mounted) setAuthNotice(msg);
      }

      if (code) {
        const { data, error } = await supabase!.auth.exchangeCodeForSession(code);
        stripAuthParams();
        if (!mounted) return;
        if (error) {
          setAuthNotice(
            /expired|invalid|already|flow state/i.test(error.message)
              ? "That email link was already used or expired. Sign in with your email and password."
              : error.message,
          );
        } else if (data.session) {
          setSession(data.session);
          setUser(data.session.user);
          setLocalOnly(false);
          setAuthNotice("Email confirmed — you’re signed in.");
          setReady(true);
          return;
        }
      } else if (errRaw) {
        stripAuthParams();
      }

      const { data } = await Promise.race([
        supabase!.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 8000),
        ),
      ]);
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session) setLocalOnly(false);
      setReady(true);
    }

    void boot();

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

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        // Confirmation emails return to the site the user signed up on.
        options:
          typeof window !== "undefined"
            ? { emailRedirectTo: window.location.origin }
            : undefined,
      });
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
      authNotice,
      clearAuthNotice,
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
      authNotice,
      clearAuthNotice,
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
