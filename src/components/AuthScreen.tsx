"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME, APP_TAGLINE } from "@/lib/defaults";

/**
 * Login / Sign up screen when Supabase is configured.
 * "Continue on this device" = localStorage only (same as before).
 */
export function AuthScreen({ onBack }: { onBack?: () => void }) {
  const {
    signIn,
    signUp,
    continueLocal,
    cloudEnabled,
    authNotice,
    clearAuthNotice,
  } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    clearAuthNotice();
    setBusy(true);
    const err =
      mode === "signin"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (mode === "signup") {
      setInfo(
        "Account created. Check your email if confirmation is required, then sign in.",
      );
      setMode("signin");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 self-start text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
        >
          ← Back
        </button>
      ) : null}
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-deep">
        {APP_NAME}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
        {APP_TAGLINE}
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        {cloudEnabled
          ? "Sign in to sync your books — or keep using this device only."
          : "Cloud sync is off. Add Supabase keys in .env.local to enable login."}
      </p>

      {authNotice ? (
        <p
          className="mt-4 rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm text-ink"
          role="status"
        >
          {authNotice}
        </p>
      ) : null}

      {cloudEnabled ? (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                mode === "signin"
                  ? "bg-ink text-paper"
                  : "border border-paper-line text-ink-muted"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                mode === "signup"
                  ? "bg-ink text-paper"
                  : "border border-paper-line text-ink-muted"
              }`}
            >
              Sign up
            </button>
          </div>

          <label className="block text-sm text-ink-muted">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-3 text-base text-ink"
              required
            />
          </label>
          <label className="block text-sm text-ink-muted">
            Password
            <input
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-3 text-base text-ink"
              required
            />
          </label>

          {error ? (
            <p className="text-base text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {info ? <p className="text-base text-ok">{info}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-ink px-5 py-3.5 text-base font-semibold text-paper disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      ) : null}

      <button
        type="button"
        onClick={continueLocal}
        className="mt-6 text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
      >
        Continue on this device only
      </button>
    </div>
  );
}
