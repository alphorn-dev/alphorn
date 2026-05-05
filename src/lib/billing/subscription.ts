import { cache } from "react";
import { prisma } from "../db";
import { resolveEffectiveLimits, type EffectiveLimits } from "./plans";
import { isBillingEnabled } from "./paddle";
import type { Subscription } from "@/generated/prisma/client";

/**
 * Resolve effective limits for a subscription row, unpacking override and
 * pack fields in one place.
 */
export function limitsForSubscription(
  sub: Pick<
    Subscription,
    | "plan"
    | "overrideMessageLimit"
    | "overrideWebhookLimit"
    | "overrideChannelLimit"
    | "overrideRetentionDays"
    | "purchasedPacks"
  >,
): EffectiveLimits {
  return resolveEffectiveLimits(
    sub.plan,
    {
      overrideMessageLimit: sub.overrideMessageLimit,
      overrideWebhookLimit: sub.overrideWebhookLimit,
      overrideChannelLimit: sub.overrideChannelLimit,
      overrideRetentionDays: sub.overrideRetentionDays,
    },
    sub.purchasedPacks,
  );
}

// Cached per React request so repeated billing lookups share one DB hit.
//
// A Subscription row is auto-created by a DB trigger (see migration
// 20260418100000_webhook_hot_path_opts) whenever an Organization is inserted,
// so findUnique is the fast path. The upsert below is a fallback for orgs
// that predate the trigger or any unexpected missing-row case.
export const getOrCreateSubscription = cache(
  async (organizationId: string) => {
    const existing = await prisma.subscription.findUnique({
      where: { organizationId },
    });
    if (existing) return existing;
    return prisma.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        plan: "free",
        status: "active",
      },
      update: {},
    });
  },
);

// Returns null (all unlimited) when billing is disabled.
export async function getOrgLimits(
  organizationId: string,
): Promise<EffectiveLimits | null> {
  if (!isBillingEnabled()) return null;

  const sub = await getOrCreateSubscription(organizationId);
  return limitsForSubscription(sub);
}

export async function countMessagesInPeriod(
  organizationId: string,
  periodStart: Date | null,
): Promise<number> {
  const now = new Date();
  const since = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);

  return prisma.message.count({
    where: {
      webhook: { organizationId },
      createdAt: { gte: since },
    },
  });
}

export function isWithinQuota(
  currentUsage: number,
  limit: number | null,
): boolean {
  if (limit === null) return true;
  return currentUsage < limit;
}

export async function checkMessageQuota(organizationId: string): Promise<
  | { allowed: true }
  | { allowed: false; limit: number; usage: number; plan: string }
> {
  if (!isBillingEnabled()) return { allowed: true };

  const sub = await getOrCreateSubscription(organizationId);
  return checkMessageQuotaForSubscription(organizationId, sub);
}

type QuotaSubscription = Pick<
  Subscription,
  | "plan"
  | "overrideMessageLimit"
  | "overrideWebhookLimit"
  | "overrideChannelLimit"
  | "overrideRetentionDays"
  | "purchasedPacks"
  | "currentPeriodStart"
>;

// Variant used by the webhook hot path: caller has already loaded the
// subscription row (usually via a join on the initial webhook fetch) and
// optionally pre-fetched the message count in parallel. Skipping those two
// round-trips is the whole point of this overload.
export async function checkMessageQuotaForSubscription(
  organizationId: string,
  sub: QuotaSubscription,
  precountedUsage?: Promise<number> | number,
): Promise<
  | { allowed: true }
  | { allowed: false; limit: number; usage: number; plan: string }
> {
  if (!isBillingEnabled()) return { allowed: true };

  const limits = limitsForSubscription(sub);
  if (limits.messages === null) return { allowed: true };

  const usage =
    precountedUsage === undefined
      ? await countMessagesInPeriod(organizationId, sub.currentPeriodStart)
      : await precountedUsage;

  if (usage < limits.messages) return { allowed: true };
  return { allowed: false, limit: limits.messages, usage, plan: sub.plan };
}
