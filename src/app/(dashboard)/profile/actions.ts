"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { currentUserHasPassword, requireSession } from "@/lib/auth/server";
import { factorState, grantPasskeyReauth } from "@/lib/auth/second-factor-hooks";
import { hasSecondFactor, REAUTH_MS } from "@/lib/auth/second-factor";
import { APIError } from "better-auth/api";
import { hasLiveSubscription } from "@/lib/billing/subscription";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  validateEmailChangeRequest,
  type EmailChangeValidationResult,
} from "./email-change-validation";

export type RequestEmailChangeResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number }
  | Exclude<EmailChangeValidationResult, { ok: true }>;

export async function requestEmailChange(
  currentPassword: string,
  newEmail: string,
): Promise<RequestEmailChangeResult> {
  const session = await requireSession();

  try {
    await enforceRateLimit(`app:requestEmailChange:${session.user.id}`, 5, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, reason: "rate_limited", retryAfterSec: Math.ceil(err.retryAfterMs / 1000) };
    }
    throw err;
  }

  const validation = await validateEmailChangeRequest(
    session.user.id,
    session.user.email,
    currentPassword,
    newEmail,
  );
  if (!validation.ok) return validation;

  await auth.api.changeEmail({
    headers: await headers(),
    body: { newEmail: newEmail.trim().toLowerCase() },
  });

  return { ok: true };
}

export type ConfirmPasswordResult =
  | { ok: true }
  | { ok: false; reason: "invalid_password" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number };

/** Re-authentication before adding or removing a passkey (PASSKEY_REAUTH_PATHS in @/lib/auth/second-factor). */
export async function confirmPasswordForPasskey(password: string): Promise<ConfirmPasswordResult> {
  const session = await requireSession();

  try {
    await enforceRateLimit(`app:confirmPassword:${session.user.id}`, 5, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, reason: "rate_limited", retryAfterSec: Math.ceil(err.retryAfterMs / 1000) };
    }
    throw err;
  }

  try {
    await auth.api.verifyPassword({ headers: await headers(), body: { password: String(password) } });
  } catch (err) {
    if (err instanceof APIError) return { ok: false, reason: "invalid_password" };
    throw err;
  }

  await grantPasskeyReauth(session.session.id, session.user.id);
  return { ok: true };
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "invalid_password" | "second_factor_required" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number };

/**
 * Deleting the account needs a fresh proof, so a hijacked session can't do it: the password
 * (users who have one) and a second factor proven in the last REAUTH_MS (users who have one).
 * The client proves the factor first via verify-totp or a passkey sign-in, which stamp
 * secondFactorAt on the session. SSO-only users without a factor need nothing extra.
 */
export async function deleteAccount(password?: string): Promise<DeleteAccountResult> {
  const session = await requireSession();
  const userId = session.user.id;

  try {
    await enforceRateLimit(`app:deleteAccount:${userId}`, 5, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, reason: "rate_limited", retryAfterSec: Math.ceil(err.retryAfterMs / 1000) };
    }
    throw err;
  }

  if (await currentUserHasPassword()) {
    try {
      await auth.api.verifyPassword({ headers: await headers(), body: { password: String(password ?? "") } });
    } catch (err) {
      if (err instanceof APIError) return { ok: false, reason: "invalid_password" };
      throw err;
    }
  }

  const proven = session.session.secondFactorAt;
  if (
    hasSecondFactor(await factorState(userId)) &&
    !(proven && Date.now() - new Date(proven).getTime() <= REAUTH_MS)
  ) {
    return { ok: false, reason: "second_factor_required" };
  }

  // Deleting the user cascades its Member rows, so a shared project where it
  // is the only owner would be left ownerless.
  const soleOwnerOfShared = await prisma.member.findMany({
    where: {
      userId,
      role: "owner",
      organization: {
        members: {
          some: { userId: { not: userId } },
          none: { userId: { not: userId }, role: "owner" },
        },
      },
    },
    select: { organization: { select: { name: true } } },
  });
  if (soleOwnerOfShared.length > 0) {
    const names = soleOwnerOfShared.map((m) => m.organization.name).join(", ");
    throw new Error(`Transfer ownership of ${names} before deleting your account.`);
  }

  // Sole-member projects are deleted with the account (below), so the same
  // guard as deleteProject() applies to them.
  const soleOwned = await prisma.member.findMany({
    where: { userId, organization: { members: { every: { userId } } } },
    select: { organizationId: true },
  });
  if (await hasLiveSubscription(soleOwned.map((m) => m.organizationId))) {
    throw new Error(
      "Cancel the subscription of your project in Billing before deleting your account.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const memberships = await tx.member.findMany({
      where: { userId },
      select: { organizationId: true },
    });

    const orgIds = memberships.map((m) => m.organizationId);

    const orgMemberCounts = await tx.member.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: orgIds } },
      _count: { id: true },
    });

    const soleOrgIds = orgMemberCounts
      .filter((g) => g._count.id === 1)
      .map((g) => g.organizationId);

    // Double-check: for sole-member orgs, verify this user is actually that member
    if (soleOrgIds.length > 0) {
      const verified = await tx.member.findMany({
        where: {
          organizationId: { in: soleOrgIds },
          userId,
        },
        select: { organizationId: true },
      });
      const verifiedIds = new Set(verified.map((m) => m.organizationId));

      const safeToDelete = soleOrgIds.filter((id) => verifiedIds.has(id));

      if (safeToDelete.length > 0) {
        // Deleting Organization cascades: Members, Invitations, InviteLinks,
        // Webhooks, Channels, WebhookChannels, Messages, Deliveries,
        // OrganizationSettings
        await tx.organization.deleteMany({
          where: { id: { in: safeToDelete } },
        });
      }
    }

    // Delete the user - cascades: Sessions, Accounts, TwoFactors,
    // remaining Members, Invitations, InviteLinks
    await tx.user.delete({ where: { id: userId } });
    // The org cascade deletes every Message and Delivery (plus their GIN
    // index entries); Prisma's 5s default aborts that for large projects.
    // ponytail: one long transaction; batch-purge messages first if 2 min
    // ever isn't enough.
  }, { timeout: 120_000 });
  return { ok: true };
}
