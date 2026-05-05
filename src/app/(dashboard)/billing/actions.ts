"use server";

import { requireAdminOrOwner } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { getPaddle, isBillingEnabled } from "@/lib/billing/paddle";
import { paddleEnv } from "@/lib/billing/env";
import {
  getOrCreateSubscription,
  countMessagesInPeriod,
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
    countMessagesInPeriod(orgId, sub.currentPeriodStart),
    prisma.webhook.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.channel.count({ where: { organizationId: orgId } }),
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

export async function getCheckoutData(targetPlan: PlanId) {
  const { session, orgId } = await requireAdminOrOwner();

  const priceId = getPaddlePriceId(targetPlan);
  if (!priceId) throw new Error("Invalid plan");

  const sub = await getOrCreateSubscription(orgId);

  return {
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
    throw new Error("No active subscription — upgrade first");
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
    throw new Error("No billing customer yet — upgrade first");
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
