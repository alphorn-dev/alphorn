"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth/server";
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

export async function deleteAccount() {
  const session = await requireSession();
  const userId = session.user.id;

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

    // Delete the user — cascades: Sessions, Accounts, TwoFactors,
    // remaining Members, Invitations, InviteLinks
    await tx.user.delete({ where: { id: userId } });
  });
}
