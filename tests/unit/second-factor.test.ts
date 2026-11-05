import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { APIError } from "better-auth/api";
import {
  allowedWhilePending,
  codeAttemptAllowed,
  endpointSucceeded,
  MAX_FAILED_CODES,
  PASSKEY_NAME_MAX,
  passkeyNameAllowed,
  REAUTH_MS,
  signedInRecently,
  secondFactorPending,
  secondFactorProven,
} from "@/lib/auth/second-factor";

// better-call's base APIError (validation errors use it). Not a direct dependency, so resolve
// it the way Better Auth does.
const fromBetterAuth = createRequire(createRequire(import.meta.url).resolve("better-auth"));
const { APIError: BaseAPIError } = (await import(fromBetterAuth.resolve("better-call/error"))) as {
  APIError: new (status: string, body?: object) => Error;
};

const none = { twoFactorEnabled: false, passkeys: 0 };
const totp = { twoFactorEnabled: true, passkeys: 0 };
const passkey = { twoFactorEnabled: false, passkeys: 1 };
const at = new Date("2026-11-05T12:00:00Z");

describe("second factor rules", () => {
  it("endpointSucceeded: only a real response counts, every error class fails", () => {
    expect(endpointSucceeded({ token: "t", user: {} })).toBe(true);
    expect(endpointSucceeded({ status: true })).toBe(true);
    expect(endpointSucceeded(new APIError("UNAUTHORIZED", { message: "Invalid code" }))).toBe(false);
    const validation = new BaseAPIError("BAD_REQUEST", { message: "Invalid body" });
    expect(validation instanceof APIError).toBe(false); // the trap: not Better Auth's subclass
    expect(endpointSucceeded(validation)).toBe(false);
    expect(endpointSucceeded(new Error("boom"))).toBe(false);
    expect(endpointSucceeded(undefined)).toBe(false);
    expect(endpointSucceeded(null)).toBe(false);
  });

  it("pending only when a factor exists and this session has not proven it", () => {
    expect(secondFactorPending(none, null)).toBe(false);
    expect(secondFactorPending(totp, null)).toBe(true);
    expect(secondFactorPending(passkey, null)).toBe(true);
    expect(secondFactorPending(totp, at)).toBe(false);
  });

  it("proven needs a factor the user still has", () => {
    expect(secondFactorProven(passkey, at)).toBe(true);
    expect(secondFactorProven(none, at)).toBe(false); // factor removed after proving it
    expect(secondFactorProven(totp, null)).toBe(false);
  });

  it("a pending session may only verify or sign out", () => {
    for (const p of [
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
      "/passkey/generate-authenticate-options",
      "/passkey/verify-authentication",
      "/sign-out",
      "/get-session",
    ]) {
      expect(allowedWhilePending(p), p).toBe(true);
    }
    for (const p of [
      "/two-factor/disable",
      "/two-factor/enable",
      "/passkey/delete-passkey",
      "/passkey/generate-register-options",
      "/passkey/verify-registration",
      "/change-password",
      "/change-email",
      "/link-social",
      "/revoke-sessions",
      "/organization/set-active",
    ]) {
      expect(allowedWhilePending(p), p).toBe(false);
    }
  });

  it("code attempts: the first MAX are checked, the next one locks", () => {
    expect(codeAttemptAllowed(1)).toBe(true);
    expect(codeAttemptAllowed(MAX_FAILED_CODES)).toBe(true);
    expect(codeAttemptAllowed(MAX_FAILED_CODES + 1)).toBe(false);
  });

  it("passkey names: optional, not blank, capped", () => {
    expect(passkeyNameAllowed(undefined)).toBe(true);
    expect(passkeyNameAllowed("Work laptop")).toBe(true);
    expect(passkeyNameAllowed("x".repeat(PASSKEY_NAME_MAX))).toBe(true);
    expect(passkeyNameAllowed("x".repeat(PASSKEY_NAME_MAX + 1))).toBe(false);
    expect(passkeyNameAllowed("   ")).toBe(false);
    expect(passkeyNameAllowed(42)).toBe(false);
  });
});

describe("signedInRecently", () => {
  it("accepts an SSO sign-in or factor proof within REAUTH_MS, and only then", () => {
    const now = Date.now();
    const at = (ms: number) => new Date(now - ms);
    expect(signedInRecently({ ssoSignInAt: at(REAUTH_MS) }, now)).toBe(true);
    expect(signedInRecently({ secondFactorAt: at(REAUTH_MS) }, now)).toBe(true);
    expect(signedInRecently({ ssoSignInAt: at(REAUTH_MS + 1) }, now)).toBe(false);
    expect(signedInRecently({ ssoSignInAt: null, secondFactorAt: null }, now)).toBe(false);
  });
});
