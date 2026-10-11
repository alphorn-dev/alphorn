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
    | "status"
    | "currentPeriodEnd"
    | "overrideMessageLimit"
    | "overrideWebhookLimit"
    | "overrideChannelLimit"
    | "overrideRetentionDays"
    | "purchasedPacks"
  >,
): EffectiveLimits {
  return resolveEffectiveLimits(
    effectivePlan(sub),
    {
      overrideMessageLimit: sub.overrideMessageLimit,
      overrideWebhookLimit: sub.overrideWebhookLimit,
      overrideChannelLimit: sub.overrideChannelLimit,
      overrideRetentionDays: sub.overrideRetentionDays,
    },
    sub.purchasedPacks,
  );
}

/**
 * The plan whose limits actually apply. Paddle status webhooks only change
 * `status`, never `plan`, so entitlements must be gated here: a paused or
 * (past period end) cancelled subscription falls back to free. A cancelled
 * subscription keeps its plan until `currentPeriodEnd`. past_due keeps the
 * plan: Paddle is still retrying the payment, and dropping to free would make
 * enforcePlanLimits disable resources that nothing re-enables once it succeeds.
 */
export function effectivePlan(
  sub: Pick<Subscription, "plan" | "status" | "currentPeriodEnd">,
): string {
  if (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") {
    return sub.plan;
  }
  if (
    sub.status === "cancelled" &&
    sub.currentPeriodEnd &&
    sub.currentPeriodEnd.getTime() > Date.now()
  ) {
    return sub.plan;
  }
  return "free";
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

/**
 * Whether any of the orgs still has a paid Paddle subscription that bills.
 * Deleting such an org would leave the customer charged with no way to cancel
 * from the app.
 */
export async function hasLiveSubscription(organizationIds: string[]): Promise<boolean> {
  const live = await prisma.subscription.count({
    where: {
      organizationId: { in: organizationIds },
      paddleSubscriptionId: { not: null },
      plan: { not: "free" },
      status: { not: "cancelled" },
    },
  });
  return live > 0;
}

// Returns null (all unlimited) when billing is disabled.
export async function getOrgLimits(
  organizationId: string,
): Promise<EffectiveLimits | null> {
  if (!isBillingEnabled()) return null;

  const sub = await getOrCreateSubscription(organizationId);
  return limitsForSubscription(sub);
}

/**
 * Start of the window message usage is counted in: the Paddle billing period
 * while the paid plan applies, otherwise the calendar month. Paddle never
 * clears currentPeriodStart, so after a subscription lapses counting from it
 * would leave the free quota exhausted forever.
 */
export function usagePeriodStart(
  sub: Pick<Subscription, "plan" | "status" | "currentPeriodStart" | "currentPeriodEnd">,
): Date {
  if (sub.currentPeriodStart && effectivePlan(sub) === sub.plan) {
    return sub.currentPeriodStart;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function countMessagesInPeriod(
  organizationId: string,
  since: Date,
): Promise<number> {
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

type QuotaSubscription = Pick<
  Subscription,
  | "plan"
  | "status"
  | "currentPeriodEnd"
  | "overrideMessageLimit"
  | "overrideWebhookLimit"
  | "overrideChannelLimit"
  | "overrideRetentionDays"
  | "purchasedPacks"
  | "currentPeriodStart"
>;

// Variant used by the webhook hot path: caller has already loaded the
// subscription row (usually via a join on the initial webhook fetch),
// skipping that round-trip.
export async function checkMessageQuotaForSubscription(
  organizationId: string,
  sub: QuotaSubscription,
): Promise<
  | { allowed: true }
  | { allowed: false; limit: number; usage: number; plan: string }
> {
  if (!isBillingEnabled()) return { allowed: true };

  const limits = limitsForSubscription(sub);
  if (limits.messages === null) return { allowed: true };

  const usage = await countMessagesInPeriod(organizationId, usagePeriodStart(sub));

  if (usage < limits.messages) return { allowed: true };
  return { allowed: false, limit: limits.messages, usage, plan: sub.plan };
}
