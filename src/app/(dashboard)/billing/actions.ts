"use server";

import { requireAdminOrOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { getPaddle, isBillingEnabled } from "@/lib/billing/paddle";
import { paddleEnv } from "@/lib/billing/env";
import {
  getOrCreateSubscription,
  countMessagesInPeriod,
  usagePeriodStart,
  limitsForSubscription,
} from "@/lib/billing/subscription";
import {
  getPaddlePriceId,
  getMessagePackPriceId,
  type PlanId,
} from "@/lib/billing/plans";

export async function getBillingData() {
  const { orgId } = await requireAdminOrOwner();

  const billingEnabled = isBillingEnabled();
  const env = billingEnabled ? paddleEnv() : null;
  const sub = await getOrCreateSubscription(orgId);
  const limits = limitsForSubscription(sub);

  const [messageCount, webhookCount, channelCount] = await Promise.all([
    countMessagesInPeriod(orgId, usagePeriodStart(sub)),
    prisma.webhook.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.channel.count({ where: { organizationId: orgId, deletedAt: null } }),
  ]);

  return {
    billingEnabled,
    paddleClientToken: env?.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? null,
    paddleEnvironment: env?.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "production",
    plan: sub.plan,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    purchasedPacks: sub.purchasedPacks,
    limits,
    usage: {
      messages: messageCount,
      webhooks: webhookCount,
      channels: channelCount,
    },
    hasSubscription: !!sub.paddleSubscriptionId,
  };
}

export async function getSubscriptionStatus() {
  const { orgId } = await requireAdminOrOwner();
  const sub = await prisma.subscription.findUnique({
    where: { organizationId: orgId },
    select: {
      plan: true,
      status: true,
      paddleSubscriptionId: true,
      purchasedPacks: true,
    },
  });
  return {
    plan: sub?.plan ?? "free",
    status: sub?.status ?? "active",
    hasSubscription: !!sub?.paddleSubscriptionId,
    totalPacks: sub?.purchasedPacks ?? 0,
  };
}

/**
 * Start an upgrade or resubscribe. Orgs without a live Paddle subscription get
 * checkout data for a new one. Orgs that still have one (active, past_due, or
 * cancelled but running to period end) get it changed in place: a second
 * checkout would create a second subscription and bill the customer twice.
 * The subscription.updated webhook then syncs the new plan.
 */
export async function startPlanChange(
  targetPlan: PlanId,
): Promise<
  | { kind: "checkout"; priceId: string; customerId: string | null; email: string; organizationId: string }
  | { kind: "changed" }
> {
  const { session, orgId } = await requireAdminOrOwner();

  const priceId = getPaddlePriceId(targetPlan);
  if (!priceId) throw new Error("Invalid plan");

  const sub = await getOrCreateSubscription(orgId);

  if (sub.paddleSubscriptionId) {
    const paddle = getPaddle();
    if (!paddle) throw new Error("Billing not configured");
    // Ask Paddle, not our row: the webhook that ended or changed it may lag.
    const live = await paddle.subscriptions.get(sub.paddleSubscriptionId);
    if (live.status !== "canceled") {
      if (live.status === "paused") {
        throw new Error("Your subscription is paused. Resume it via Manage billing first.");
      }
      // Paddle rejects item changes while a change (e.g. cancel) is scheduled.
      if (live.scheduledChange) {
        await paddle.subscriptions.update(live.id, { scheduledChange: null });
      }
      if (!live.items.some((item) => item.price?.id === priceId)) {
        await paddle.subscriptions.update(live.id, {
          items: [{ priceId, quantity: 1 }],
          prorationBillingMode: "prorated_immediately",
        });
      }
      return { kind: "changed" };
    }
  }

  return {
    kind: "checkout",
    priceId,
    customerId: sub.paddleCustomerId,
    email: session.user.email,
    organizationId: orgId,
  };
}

// Pack credit happens on checkout.completed via the transaction.completed webhook.
export async function getMessagePackCheckoutData() {
  const { session, orgId } = await requireAdminOrOwner();

  const sub = await prisma.subscription.findUnique({
    where: { organizationId: orgId },
    select: { paddleCustomerId: true, paddleSubscriptionId: true },
  });

  if (!sub?.paddleSubscriptionId) {
    throw new Error("No active subscription - upgrade first");
  }

  const priceId = getMessagePackPriceId();
  if (!priceId) {
    throw new Error("Message pack price not configured");
  }

  return {
    priceId,
    customerId: sub.paddleCustomerId,
    email: session.user.email,
    organizationId: orgId,
  };
}

export async function getCustomerPortalUrl(): Promise<string> {
  const { orgId } = await requireAdminOrOwner();

  const paddle = getPaddle();
  if (!paddle) throw new Error("Billing not configured");

  const sub = await prisma.subscription.findUnique({
    where: { organizationId: orgId },
    select: { paddleCustomerId: true, paddleSubscriptionId: true },
  });

  if (!sub?.paddleCustomerId) {
    throw new Error("No billing customer yet - upgrade first");
  }

  const portalSession = await paddle.customerPortalSessions.create(
    sub.paddleCustomerId,
    sub.paddleSubscriptionId ? [sub.paddleSubscriptionId] : [],
  );

  return portalSession.urls.general.overview;
}

export async function cancelSubscription() {
  const { orgId } = await requireAdminOrOwner();

  const paddle = getPaddle();
  if (!paddle) throw new Error("Billing not configured");

  const sub = await prisma.subscription.findUnique({
    where: { organizationId: orgId },
    select: { paddleSubscriptionId: true },
  });

  if (!sub?.paddleSubscriptionId) {
    throw new Error("No active subscription");
  }

  await paddle.subscriptions.cancel(sub.paddleSubscriptionId, {
    effectiveFrom: "next_billing_period",
  });
}
