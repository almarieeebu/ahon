/**
 * Pure helpers for the "Forgot password?" flow.
 * Walay Supabase / window dinhi — para ma-unit test.
 */

/** Same minimum as the sign-up form (Supabase default is 6). */
export const MIN_PASSWORD_LENGTH = 6;

export type AuthCallback =
  | { kind: "none" }
  /** PKCE: `?code=...` (our client uses flowType "pkce" via @supabase/ssr) */
  | { kind: "pkce"; code: string }
  /**
   * Implicit: `#access_token=...&type=recovery` — e.g. a recovery email sent
   * from the Supabase dashboard. Our PKCE client won't read these itself.
   */
  | {
      kind: "implicit";
      recovery: boolean;
      accessToken: string;
      refreshToken: string | null;
    }
  /** Custom email template: `?token_hash=...&type=recovery` */
  | { kind: "token_hash"; tokenHash: string; type: string; recovery: boolean };

/** Read what kind of auth redirect (if any) the current URL is. */
export function parseAuthCallback(href: string): AuthCallback {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "none" };
  }
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

  const tokenHash = query.get("token_hash");
  const type = query.get("type");
  if (tokenHash && type) {
    return {
      kind: "token_hash",
      tokenHash,
      type,
      recovery: type === "recovery",
    };
  }

  const code = query.get("code");
  if (code) return { kind: "pkce", code };

  const accessToken = hash.get("access_token");
  if (accessToken) {
    return {
      kind: "implicit",
      recovery: hash.get("type") === "recovery",
      accessToken,
      refreshToken: hash.get("refresh_token"),
    };
  }

  return { kind: "none" };
}

/** Pull a readable error from `?error_description=` or `#error_description=`. */
export function authErrorFromUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const raw =
    url.searchParams.get("error_description") ||
    hash.get("error_description") ||
    url.searchParams.get("error") ||
    hash.get("error");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

/** Validate new password + confirm. Returns an error message or null. */
export function validateNewPassword(
  password: string,
  confirm: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return "The two passwords don’t match.";
  }
  return null;
}

/** Turn Supabase link errors into friendly copy. */
export function friendlyLinkError(message: string): string {
  if (/code verifier/i.test(message)) {
    return "Please open that email link in the same browser you used to request it — or sign in and request a new link here.";
  }
  if (/expired|invalid|already|flow state/i.test(message)) {
    return "That email link was already used or expired. Sign in with your email and password, or request a new link.";
  }
  return message;
}
