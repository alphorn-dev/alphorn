"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth/server";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  validateEmailChangeRequest,
  type EmailChangeValidationResult,
} from "./email-change-validation";

export type EmailTakenResult =
  | { ok: true; taken: boolean }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number };

export async function isEmailTaken(email: string): Promise<EmailTakenResult> {
  const session = await requireSession();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: true, taken: false };

  try {
    await enforceRateLimit(`app:isEmailTaken:${session.user.id}`, 10, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, reason: "rate_limited", retryAfterSec: Math.ceil(err.retryAfterMs / 1000) };
    }
    throw err;
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  return { ok: true, taken: existing !== null };
}

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
