"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME } from "@/lib/defaults";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/authRecovery";

/**
 * Shown after the user opens a password-reset email link (PASSWORD_RECOVERY).
 * They have a recovery session, but we keep them here until a new password is set.
 */
export function ResetPasswordScreen() {
  const { user, updatePassword, finishRecovery, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-deep">
        {APP_NAME}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
        {done ? "Password updated" : "Set a new password"}
      </h1>

      {done ? (
        <>
          <p className="mt-2 text-base text-ok" role="status">
            All set — your new password is saved and you’re signed in.
          </p>
          <button
            type="button"
            onClick={finishRecovery}
            className="mt-8 w-full rounded-full bg-ink px-5 py-3.5 text-base font-semibold text-paper"
          >
            Continue to {APP_NAME}
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-base text-ink-muted">
            {user?.email
              ? `Choose a new password for ${user.email}.`
              : "Choose a new password for your account."}
          </p>
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block text-sm text-ink-muted">
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-3 text-base text-ink"
                required
              />
            </label>
            <label className="block text-sm text-ink-muted">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-3 text-base text-ink"
                required
              />
            </label>
            <p className="text-sm text-ink-muted">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>

            {error ? (
              <p className="text-base text-danger" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ink px-5 py-3.5 text-base font-semibold text-paper disabled:opacity-60"
            >
              {busy ? "Please wait…" : "Save new password"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-6 text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
          >
            Cancel and sign out
          </button>
        </>
      )}
    </div>
  );
}
