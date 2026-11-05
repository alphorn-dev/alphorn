// Second factor (passkey or authenticator app): pure rules, isomorphic.
//
// Better Auth's twoFactor plugin only challenges password sign-ins for TOTP users. Alphorn
// enforces the rest itself: a session records when it proved a second factor
// (`Session.secondFactorAt`). A user who set up a factor must prove it once per session,
// whichever way they signed in (password, SSO). Until then the session is "pending":
// getSession() treats it as signed out and the Better Auth hooks refuse every route except
// the ones below (src/lib/auth/second-factor-hooks.ts).

/** Better Auth routes a pending session may still call. Everything else is refused (fail closed). */
const PENDING_ALLOWED_PATHS = new Set([
  "/get-session",
  "/sign-out",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
]);

export const allowedWhilePending = (path: string) => PENDING_ALLOWED_PATHS.has(path);

/**
 * Routes that, when they succeed, prove a second factor for the resulting session.
 * Registering a passkey and confirming a new authenticator app prove possession. (Routes
 * that replace the session, like /two-factor/disable, copy secondFactorAt over themselves:
 * Better Auth's createSession spreads the old session into the new one.)
 */
export const SECOND_FACTOR_PROOF_PATHS = [
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/passkey/verify-registration",
];

/** Passkey sign-in: the new session is verified from the start. */
export const PASSKEY_SIGN_IN_PATH = "/passkey/verify-authentication";

/**
 * Sessions created through an IdP: OAuth/OIDC redirect callback (social and generic OIDC both
 * use /callback/:id) or a direct ID-token sign-in. Marks the session `ssoSignInAt`.
 */
export const SSO_SIGN_IN_PATHS = ["/callback/:id", "/sign-in/social"];

/** Removing a factor signs out every other session (they may have proven exactly that factor). */
export const FACTOR_REMOVAL_PATHS = ["/two-factor/disable", "/passkey/delete-passkey"];

/** Longest passkey name (Better Auth doesn't limit it). */
export const PASSKEY_NAME_MAX = 50;
/** Passkey routes that set a user-chosen name. */
export const PASSKEY_NAME_PATHS = ["/passkey/update-passkey", "/passkey/verify-registration"];
export const passkeyNameAllowed = (name: unknown) =>
  name === undefined ||
  (typeof name === "string" && name.trim().length > 0 && name.length <= PASSKEY_NAME_MAX);

/**
 * Changing factors needs a recent re-authentication, or a hijacked session could add its own
 * factor (locking the owner out: their other sessions turn pending), remove one (signing the
 * owner out everywhere) or mint itself backup codes. Users with a password confirm it: on the
 * passkey routes via the profile action (stored as a Verification row), on the authenticator
 * app routes in Better Auth's own request body. Users without one must have signed in or
 * proven a factor within REAUTH_MS.
 */
export const PASSKEY_ADD_PATH = "/passkey/generate-register-options";
/** Passkey routes behind the password confirmation (Better Auth takes no password there). */
export const PASSKEY_REAUTH_PATHS = [PASSKEY_ADD_PATH, "/passkey/delete-passkey"];
/**
 * Authenticator app routes; Better Auth checks the password in their body for users who have
 * one. get-totp-uri also reads the secret of an unfinished setup, which verify-totp confirms.
 */
export const TOTP_PASSWORD_PATHS = [
  "/two-factor/enable",
  "/two-factor/get-totp-uri",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
];
export const REAUTH_PATHS = [...PASSKEY_REAUTH_PATHS, ...TOTP_PASSWORD_PATHS];
export const REAUTH_MS = 5 * 60_000;
/** Shown to users without a password next to the factor settings. */
export const REAUTH_HINT = `For your security, changing these needs a sign-in from the last ${REAUTH_MS / 60_000} minutes; if it's been longer, sign out and in again first.`;
export const passkeyReauthId = (sessionId: string) => `passkey-reauth:${sessionId}`;
/**
 * Not Session.createdAt: Better Auth resets it whenever it replaces a session. ssoSignInAt
 * (SSO sign-in) and secondFactorAt (passkey sign-in, factor proof) carry over unchanged.
 */
export const signedInRecently = (
  s: { ssoSignInAt?: Date | string | null; secondFactorAt?: Date | string | null },
  now = Date.now(),
) =>
  [s.ssoSignInAt, s.secondFactorAt].some((t) => !!t && now - new Date(t).getTime() <= REAUTH_MS);

/** TOTP / backup-code checks on a signed-in session, which Better Auth doesn't limit itself. */
export const SESSION_CODE_PATHS = ["/two-factor/verify-totp", "/two-factor/verify-backup-code"];

/**
 * Did a Better Auth route succeed? `ctx.context.returned` in an after hook is the response or
 * the error. Positive check on purpose: errors come in several classes (Better Auth's APIError
 * is a subclass of better-call's, which validation errors use), all extend Error.
 */
export const endpointSucceeded = (returned: unknown) =>
  returned !== undefined && returned !== null && !(returned instanceof Error);

export type FactorState = { twoFactorEnabled: boolean; passkeys: number };

export const hasSecondFactor = (f: FactorState) => f.twoFactorEnabled || f.passkeys > 0;

/** Signed in, but the second factor isn't proven yet for this session. */
export const secondFactorPending = (f: FactorState, secondFactorAt: Date | null) =>
  hasSecondFactor(f) && !secondFactorAt;

/** This session proved a factor the user still has. */
export const secondFactorProven = (f: FactorState, secondFactorAt: Date | null) =>
  hasSecondFactor(f) && !!secondFactorAt;

// Wrong codes on a signed-in session: lock the code check after MAX_FAILED_CODES in a row
// (NIST SP 800-63B §5.2.2). Stored on the TwoFactor row (failedVerificationCount, lockedUntil),
// the same columns Better Auth uses for its sign-in lockout.
export const MAX_FAILED_CODES = 10;
export const CODE_LOCK_MS = 15 * 60_000;

/** The n-th attempt in a row (counting this one) may still be checked. */
export const codeAttemptAllowed = (n: number) => n <= MAX_FAILED_CODES;
