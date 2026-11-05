import { randomUUID } from "crypto";
import { cache } from "react";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { prisma } from "../db";
import {
  allowedWhilePending,
  CODE_LOCK_MS,
  codeAttemptAllowed,
  endpointSucceeded,
  FACTOR_REMOVAL_PATHS,
  PASSKEY_NAME_MAX,
  PASSKEY_NAME_PATHS,
  PASSKEY_SIGN_IN_PATH,
  passkeyNameAllowed,
  passkeyReauthId,
  REAUTH_MS,
  REAUTH_PATHS,
  SECOND_FACTOR_PROOF_PATHS,
  secondFactorPending,
  SESSION_CODE_PATHS,
  signedInRecently,
  TOTP_PASSWORD_PATHS,
  type FactorState,
} from "./second-factor";

// Better Auth hooks for the second factor (wired in ./index.ts). Rules live in ./second-factor.ts.

type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
type SessionWithFactor = {
  session: { id: string; secondFactorAt?: Date | null; ssoSignInAt?: Date | null };
  user: { id: string };
};

/** Memoized per server render (React cache), where getSession() asks twice; uncached elsewhere. */
export const factorState = cache(async (userId: string): Promise<FactorState> => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, _count: { select: { passkeys: true } } },
  });
  return { twoFactorEnabled: !!u?.twoFactorEnabled, passkeys: u?._count.passkeys ?? 0 };
});

const currentSession = (ctx: Ctx) =>
  getSessionFromCtx(ctx, { disableRefresh: true }) as Promise<SessionWithFactor | null>;

/** Runs before every Better Auth route. */
export async function secondFactorBefore(ctx: Ctx): Promise<void> {
  if (PASSKEY_NAME_PATHS.includes(ctx.path) && !passkeyNameAllowed(ctx.body?.name)) {
    throw new APIError("BAD_REQUEST", {
      message: `A passkey name has 1 to ${PASSKEY_NAME_MAX} characters.`,
    });
  }
  // Routes a pending session may call anyway (incl. /get-session on every render) need no
  // lookup, except the code checks, which count attempts.
  if (allowedWhilePending(ctx.path) && !SESSION_CODE_PATHS.includes(ctx.path)) return;
  const s = await currentSession(ctx);
  if (!s) return;
  // Fail closed: a session that still owes its second factor may only prove it or sign out,
  // never disable 2FA, add/remove passkeys, change the email or touch a project.
  if (
    !allowedWhilePending(ctx.path) &&
    secondFactorPending(await factorState(s.user.id), s.session.secondFactorAt ?? null)
  ) {
    throw new APIError("FORBIDDEN", {
      message: "Confirm it's you with your passkey or authenticator app first.",
    });
  }
  // Better Auth limits wrong TOTP/backup codes only during password sign-in; on a session it doesn't.
  if (SESSION_CODE_PATHS.includes(ctx.path)) await reserveCodeAttempt(s.user.id);
  if (REAUTH_PATHS.includes(ctx.path)) await assertRecentAuth(s, ctx.path);
}

// Same rule as Better Auth's shouldRequirePassword: a credential account with a password hash.
// A looser check would skip the TOTP routes here while Better Auth checks nothing (fail-open).
const hasPassword = async (userId: string) =>
  (await prisma.account.count({
    where: { userId, providerId: "credential", password: { not: null } },
  })) > 0;

/**
 * Changing a factor (REAUTH_PATHS). With a password: confirmed within REAUTH_MS (the
 * authenticator app routes check the password in their own body). Without one: a sign-in or
 * factor proof within REAUTH_MS.
 */
async function assertRecentAuth(s: SessionWithFactor, path: string): Promise<void> {
  if (await hasPassword(s.user.id)) {
    if (TOTP_PASSWORD_PATHS.includes(path)) return;
    const confirmed = await prisma.verification.count({
      where: { identifier: passkeyReauthId(s.session.id), expiresAt: { gt: new Date() } },
    });
    if (confirmed) return;
    throw new APIError("FORBIDDEN", { message: "Confirm your password first." });
  }
  if (signedInRecently(s.session)) return;
  throw new APIError("FORBIDDEN", {
    message: "For your security, sign out and sign in again, then retry within 5 minutes.",
  });
}

/** Records a password confirmation for this session; lets it change passkeys for REAUTH_MS. */
export async function grantPasskeyReauth(sessionId: string, userId: string): Promise<void> {
  const identifier = passkeyReauthId(sessionId);
  await prisma.$transaction([
    // This session's previous confirmation, and expired ones of any session (nothing else
    // removes them; they're never read again).
    prisma.verification.deleteMany({
      where: {
        OR: [
          { identifier },
          { identifier: { startsWith: passkeyReauthId("") }, expiresAt: { lt: new Date() } },
        ],
      },
    }),
    prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier,
        value: userId,
        expiresAt: new Date(Date.now() + REAUTH_MS),
      },
    }),
  ]);
}

const locked = () =>
  new APIError("TOO_MANY_REQUESTS", { message: "Too many wrong codes. Try again in 15 minutes." });

/**
 * Count this attempt before the code is checked: a single UPDATE (row lock), so parallel
 * requests are serialised and each one counts. An expired lock starts a fresh count.
 * A correct code resets it (secondFactorAfter).
 */
export async function reserveCodeAttempt(userId: string): Promise<void> {
  const now = new Date();
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    UPDATE "TwoFactor" SET
      "failedVerificationCount" = CASE WHEN "lockedUntil" <= ${now} THEN 1 ELSE COALESCE("failedVerificationCount", 0) + 1 END,
      "lockedUntil" = CASE WHEN "lockedUntil" <= ${now} THEN NULL ELSE "lockedUntil" END
    WHERE "userId" = ${userId} AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
    RETURNING "failedVerificationCount" AS n`;
  if (rows.length === 0) {
    // No row = no authenticator app (the route fails on its own); a row that didn't match is locked.
    if (await prisma.twoFactor.count({ where: { userId } })) throw locked();
    return;
  }
  if (!codeAttemptAllowed(rows[0].n)) {
    await prisma.twoFactor.updateMany({
      where: { userId, lockedUntil: null },
      data: { lockedUntil: new Date(now.getTime() + CODE_LOCK_MS) },
    });
    throw locked();
  }
}

/** Runs after every Better Auth route (success or failure). */
export async function secondFactorAfter(ctx: Ctx): Promise<void> {
  const path = ctx.path;
  if (path === PASSKEY_SIGN_IN_PATH) return dropPreviousSession(ctx);
  if (!SECOND_FACTOR_PROOF_PATHS.includes(path) && !FACTOR_REMOVAL_PATHS.includes(path)) return;
  // Only act on a positive success: any error must never prove a factor. A wrong code was
  // already counted in secondFactorBefore.
  if (!endpointSucceeded(ctx.context.returned)) return;
  // A TOTP sign-in challenge or enabling TOTP creates a session (newSession); otherwise it's
  // the request's session.
  const fresh = ctx.context.newSession as SessionWithFactor | null;
  const s = fresh ?? (await currentSession(ctx));
  if (!s) return;
  const userId = s.user.id;

  if (SESSION_CODE_PATHS.includes(path)) {
    await prisma.twoFactor.updateMany({
      where: { userId },
      data: { failedVerificationCount: 0, lockedUntil: null },
    });
  }

  // Removing a factor (e.g. after losing a device) signs out every other session: they may
  // have proven exactly that factor.
  if (FACTOR_REMOVAL_PATHS.includes(path)) {
    await prisma.session.deleteMany({ where: { userId, id: { not: s.session.id } } });
  }

  if (SECOND_FACTOR_PROOF_PATHS.includes(path)) {
    await prisma.session.update({
      where: { id: s.session.id },
      data: { secondFactorAt: new Date() },
    });
  }
}

/**
 * A passkey sign-in replaces the browser's session cookie, often one that was still pending
 * (/verify-2fa). Delete the session it replaced instead of leaving it valid in the database.
 */
export async function dropPreviousSession(ctx: Ctx): Promise<void> {
  if (!endpointSucceeded(ctx.context.returned)) return;
  const previous = await ctx.getSignedCookie(
    ctx.context.authCookies.sessionToken.name,
    ctx.context.secret,
  );
  if (!previous || previous === ctx.context.newSession?.session.token) return;
  await prisma.session.deleteMany({ where: { token: previous } });
}
