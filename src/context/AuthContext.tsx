"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EmailOtpType, Session, User } from "@supabase/supabase-js";
import {
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  authErrorFromUrl,
  friendlyLinkError,
  parseAuthCallback,
} from "@/lib/authRecovery";

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
  /** Send a "reset your password" email. Returns error message or null. */
  requestPasswordReset: (email: string) => Promise<string | null>;
  /**
   * true after the user opened a password-reset link (PASSWORD_RECOVERY).
   * AppRoot shows "Set a new password" instead of the app until done.
   */
  recoveryMode: boolean;
  /** Save the new password (recovery session). Returns error or null. */
  updatePassword: (password: string) => Promise<string | null>;
  /** New password saved — leave recovery mode and open the app. */
  finishRecovery: () => void;
  continueLocal: () => void;
  /** Leave local-only and show AuthScreen again */
  requestSignIn: () => void;
  /** local-only mode (no login) */
  localOnly: boolean;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Survives a reload while the "Set a new password" screen is open. */
const RECOVERY_FLAG = "ahon-password-recovery";

function setRecoveryFlag(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    else window.sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    /* private mode etc. — flag is a convenience only */
  }
}

function hasRecoveryFlag(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) === "1";
  } catch {
    return false;
  }
}

function stripAuthParams() {
  const url = new URL(window.location.href);
  [
    "code",
    "sb_flow_id",
    "error",
    "error_code",
    "error_description",
    "state",
    "token_hash",
    "type",
  ].forEach((key) => url.searchParams.delete(key));
  // Implicit-flow tokens / errors arrive in the hash — never leave them in the URL.
  if (/access_token|refresh_token|error/.test(url.hash)) url.hash = "";
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
  const [recoveryMode, setRecoveryMode] = useState(false);
  const recoveryRef = useRef(false);

  const clearRecovery = useCallback(() => {
    recoveryRef.current = false;
    setRecoveryFlag(false);
    setRecoveryMode(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    function markRecovery() {
      recoveryRef.current = true;
      setRecoveryFlag(true);
      if (!mounted) return;
      setRecoveryMode(true);
      setLocalOnly(false);
      setAuthNotice(null);
    }

    async function boot() {
      const href = window.location.href;
      const callback = parseAuthCallback(href);
      const urlError = authErrorFromUrl(href);
      let linkError: string | null = urlError;

      // Implicit flow says "recovery" right in the hash — no need to wait.
      if (callback.kind === "implicit" && callback.recovery) markRecovery();

      // Custom email templates may send ?token_hash=...&type=recovery
      // (works even on another device). The client doesn't auto-handle these.
      if (callback.kind === "token_hash") {
        const { error } = await supabase!.auth.verifyOtp({
          token_hash: callback.tokenHash,
          type: callback.type as EmailOtpType,
        });
        if (error) linkError = error.message;
        else if (callback.recovery) markRecovery();
      }

      // getSession waits for the client's own URL detection: it exchanges a
      // PKCE ?code= (or reads an implicit #access_token) and then emits
      // PASSWORD_RECOVERY / SIGNED_IN.
      const { data } = await Promise.race([
        supabase!.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 8000),
        ),
      ]);
      let session: Session | null = data.session;

      // Implicit tokens in the hash (e.g. recovery email sent from the
      // Supabase dashboard): the PKCE client ignores them, so set them here.
      if (callback.kind === "implicit" && !session) {
        if (callback.refreshToken) {
          const res = await supabase!.auth.setSession({
            access_token: callback.accessToken,
            refresh_token: callback.refreshToken,
          });
          if (res.error) linkError = res.error.message;
          else session = res.data.session;
        } else {
          linkError = "That email link is incomplete.";
        }
      }

      // Client couldn't exchange the code itself (e.g. no verifier in this
      // browser) — try once so we can show a useful message.
      if (callback.kind === "pkce" && !session) {
        const res = await supabase!.auth.exchangeCodeForSession(callback.code);
        if (res.error) linkError = res.error.message;
        else session = res.data.session;
      }

      if (callback.kind !== "none" && session) {
        // PASSWORD_RECOVERY is emitted on a timer right after the exchange —
        // give it a moment so we never flash the app before "Set a new password".
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      if (callback.kind !== "none" || urlError) stripAuthParams();
      if (!mounted) return;

      if (session) {
        linkError = null;
        if (hasRecoveryFlag()) markRecovery();
        else if (callback.kind !== "none" && !recoveryRef.current) {
          setAuthNotice("Email confirmed — you’re signed in.");
        }
        setLocalOnly(false);
      } else {
        clearRecovery();
      }
      if (linkError) setAuthNotice(friendlyLinkError(linkError));

      setSession(session);
      setUser(session?.user ?? null);
      setReady(true);
    }

    void boot();

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") markRecovery();
      if (event === "SIGNED_OUT") clearRecovery();
      setSession(next);
      setUser(next?.user ?? null);
      if (next) setLocalOnly(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, clearRecovery]);

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

  const requestPasswordReset = useCallback(
    async (email: string) => {
      if (!supabase) return "Supabase not configured";
      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        // The reset link returns to the site the user asked from.
        typeof window !== "undefined"
          ? { redirectTo: window.location.origin }
          : undefined,
      );
      return error?.message ?? null;
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!supabase) return "Supabase not configured";
      const { error } = await supabase.auth.updateUser({ password });
      return error?.message ?? null;
    },
    [supabase],
  );

  const finishRecovery = useCallback(() => {
    clearRecovery();
    setAuthNotice(null);
  }, [clearRecovery]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    clearRecovery();
    await supabase.auth.signOut();
    // Back to AuthScreen so user can sign in again (or continue local)
    setLocalOnly(false);
  }, [supabase, clearRecovery]);

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
      requestPasswordReset,
      recoveryMode,
      updatePassword,
      finishRecovery,
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
      requestPasswordReset,
      recoveryMode,
      updatePassword,
      finishRecovery,
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
