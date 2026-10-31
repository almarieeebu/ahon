import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  authErrorFromUrl,
  friendlyLinkError,
  parseAuthCallback,
  validateNewPassword,
} from "./authRecovery";

describe("parseAuthCallback", () => {
  it("returns none for a plain URL", () => {
    expect(parseAuthCallback("https://ahon.app/")).toEqual({ kind: "none" });
    expect(parseAuthCallback("not a url")).toEqual({ kind: "none" });
  });

  it("detects a PKCE ?code= redirect", () => {
    expect(parseAuthCallback("https://ahon.app/?code=abc123")).toEqual({
      kind: "pkce",
      code: "abc123",
    });
  });

  it("detects an implicit recovery hash", () => {
    expect(
      parseAuthCallback(
        "https://ahon.app/#access_token=t&refresh_token=r&type=recovery",
      ),
    ).toEqual({
      kind: "implicit",
      recovery: true,
      accessToken: "t",
      refreshToken: "r",
    });
    expect(
      parseAuthCallback("https://ahon.app/#access_token=t&type=signup"),
    ).toMatchObject({ kind: "implicit", recovery: false, refreshToken: null });
  });

  it("detects a token_hash recovery link", () => {
    expect(
      parseAuthCallback("https://ahon.app/?token_hash=h1&type=recovery"),
    ).toEqual({
      kind: "token_hash",
      tokenHash: "h1",
      type: "recovery",
      recovery: true,
    });
  });
});

describe("authErrorFromUrl", () => {
  it("reads errors from the query or hash", () => {
    expect(
      authErrorFromUrl("https://ahon.app/?error_description=Link+expired"),
    ).toBe("Link expired");
    expect(
      authErrorFromUrl(
        "https://ahon.app/#error=access_denied&error_description=Email%20link%20is%20invalid",
      ),
    ).toBe("Email link is invalid");
    expect(authErrorFromUrl("https://ahon.app/")).toBeNull();
  });
});

describe("validateNewPassword", () => {
  it("enforces the sign-up minimum length", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short)).toMatch(/at least/);
  });

  it("requires both entries to match", () => {
    expect(validateNewPassword("secret1", "secret2")).toMatch(/match/);
  });

  it("accepts a valid password", () => {
    expect(validateNewPassword("secret1", "secret1")).toBeNull();
  });
});

describe("friendlyLinkError", () => {
  it("rewrites expired / reused link errors", () => {
    expect(friendlyLinkError("Email link is invalid or has expired")).toMatch(
      /already used or expired/,
    );
    expect(
      friendlyLinkError("PKCE code verifier not found in storage."),
    ).toMatch(/same browser/);
  });

  it("passes other errors through", () => {
    expect(friendlyLinkError("Network down")).toBe("Network down");
  });
});
