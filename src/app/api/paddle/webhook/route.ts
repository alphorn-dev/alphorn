import { NextResponse } from "next/server";
import {
  EventName,
  type EventEntity,
  type SubscriptionNotification,
  type TransactionNotification,
} from "@paddle/paddle-node-sdk";
import { Prisma } from "@/generated/prisma/client";
import { getPaddle } from "@/lib/billing/paddle";
import { paddleEnv } from "@/lib/billing/env";
import { getPlanFromPriceId, getMessagePackPriceId } from "@/lib/billing/plans";
import { limitsForSubscription } from "@/lib/billing/subscription";
import { recordSubscriptionTransition } from "@/lib/billing/subscription-events";
import { prisma } from "@/lib/db";
import {
  PayloadTooLargeError,
  readBodyWithLimit,
} from "@/lib/http/body-limit";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "paddle-webhook" });
const PADDLE_WEBHOOK_BODY_LIMIT_BYTES = 256 * 1024;

type Tx = Prisma.TransactionClient;

export async function POST(request: Request) {
  const paddle = getPaddle();
  if (!paddle) {
    return NextResponse.json(
      { error: "Billing not configured" },
      { status: 503 },
    );
  }

  const webhookSecret = paddleEnv().PADDLE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error("PADDLE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("paddle-signature");
  if (!signature) {
    log.warn("Missing paddle-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(request, PADDLE_WEBHOOK_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      log.warn(
        { limit: err.limit },
        "Paddle webhook payload too large",
      );
      return NextResponse.json(
        { error: "Payload too large", limit: err.limit },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  let event: EventEntity;
  try {
    event = await paddle.webhooks.unmarshal(rawBody, webhookSecret, signature);
  } catch (err) {
    log.warn({ err }, "Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Idempotency + handler in one transaction. Inserting PaddleEvent at the
  // start atomically claims the event ID; if the handler throws, the whole
  // transaction rolls back and Paddle's retry will reprocess cleanly.
  try {
    await prisma.$transaction(
      async (tx) => {
        try {
          await tx.paddleEvent.create({
            data: {
              id: event.eventId,
              type: event.eventType,
              processedAt: new Date(),
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            throw new DuplicateEventError();
          }
          throw err;
        }

        await dispatch(tx, event);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (err) {
    if (err instanceof DuplicateEventError) {
      log.info(
        { eventId: event.eventId, eventType: event.eventType },
        "Duplicate event, skipping",
      );
      return NextResponse.json({ ok: true });
    }
    if (err instanceof RejectedEventError) {
      log.warn(
        { eventId: event.eventId, eventType: event.eventType, reason: err.message },
        "Rejecting event with inconsistent customData — not retrying",
      );
      await prisma.paddleEvent
        .upsert({
          where: { id: event.eventId },
          create: {
            id: event.eventId,
            type: event.eventType,
            error: err.message,
          },
          update: { error: err.message },
        })
        .catch(() => {});
      return NextResponse.json({ ok: true });
    }
    if (err instanceof RetryableError) {
      log.warn(
        { eventId: event.eventId, eventType: event.eventType, reason: err.message },
        "Retryable error, asking Paddle to retry",
      );
      // Record the failure on a separate connection so we keep a debug trail
      // even though the transaction rolled back.
      await prisma.paddleEvent
        .upsert({
          where: { id: event.eventId },
          create: {
            id: event.eventId,
            type: event.eventType,
            error: err.message,
          },
          update: { error: err.message },
        })
        .catch(() => {});
      return NextResponse.json({ error: err.message }, { status: 503 });
    }

    log.error(
      { err, eventId: event.eventId, eventType: event.eventType },
      "Error processing webhook event",
    );
    await prisma.paddleEvent
      .upsert({
        where: { id: event.eventId },
        create: {
          id: event.eventId,
          type: event.eventType,
          error: err instanceof Error ? err.message : "Unknown",
        },
        update: { error: err instanceof Error ? err.message : "Unknown" },
      })
      .catch(() => {});
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  log.info(
    { eventId: event.eventId, eventType: event.eventType },
    "Processed paddle webhook event",
  );
  return NextResponse.json({ ok: true });
}

class DuplicateEventError extends Error {}
class RetryableError extends Error {}
class RejectedEventError extends Error {}

async function dispatch(tx: Tx, event: EventEntity) {
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionResumed:
      await handleSubscriptionUpdate(
        tx,
        event.data as SubscriptionNotification,
        event.eventId,
      );
      break;

    case EventName.SubscriptionCanceled:
      await handleSubscriptionStatus(
        tx,
        event.data as SubscriptionNotification,
        "cancelled",
        event.eventId,
      );
      break;

    case EventName.SubscriptionPaused:
      await handleSubscriptionStatus(
        tx,
        event.data as SubscriptionNotification,
        "paused",
        event.eventId,
      );
      break;

    case EventName.SubscriptionPastDue:
      await handleSubscriptionStatus(
        tx,
        event.data as SubscriptionNotification,
        "past_due",
        event.eventId,
      );
      break;

    case EventName.TransactionCompleted:
      await handleTransactionCompleted(tx, event.data as TransactionNotification);
      break;

    default:
      log.info(
        { eventType: event.eventType },
        "Unhandled event type, ignoring",
      );
  }
}

/**
 * Resolve the org for a subscription event. Falls back from customData →
 * paddleSubscriptionId → paddleCustomerId. Throws a RetryableError when the
 * subscription clearly belongs to us (has customerId/subId we know about) but
 * we can't link it yet — Paddle will retry until the checkout completes.
 */
async function resolveOrgIdForSubscription(
  tx: Tx,
  data: SubscriptionNotification,
): Promise<string | null> {
  const fromCustomData = (data.customData as Record<string, unknown> | null)
    ?.organizationId;
  if (typeof fromCustomData === "string") {
    // Guard against forged customData. A client controls checkout customData
    // before Paddle signs it, so a bad actor could point at a victim org.
    // Reject permanently if the event's paddleCustomerId is already bound to
    // a different org, or the claimed org is already bound to a different
    // paddleCustomerId — the binding must be consistent.
    const byCustomer = await tx.subscription.findUnique({
      where: { paddleCustomerId: data.customerId },
      select: { organizationId: true },
    });
    if (byCustomer && byCustomer.organizationId !== fromCustomData) {
      throw new RejectedEventError(
        `customData.organizationId=${fromCustomData} does not match org ${byCustomer.organizationId} already linked to paddleCustomerId=${data.customerId}`,
      );
    }
    const claimedOrg = await tx.subscription.findUnique({
      where: { organizationId: fromCustomData },
      select: { paddleCustomerId: true },
    });
    if (
      claimedOrg?.paddleCustomerId &&
      claimedOrg.paddleCustomerId !== data.customerId
    ) {
      throw new RejectedEventError(
        `org ${fromCustomData} is linked to paddleCustomerId=${claimedOrg.paddleCustomerId}, event carried ${data.customerId}`,
      );
    }
    return fromCustomData;
  }

  const bySubId = await tx.subscription.findUnique({
    where: { paddleSubscriptionId: data.id },
    select: { organizationId: true },
  });
  if (bySubId) return bySubId.organizationId;

  const byCustomerId = await tx.subscription.findUnique({
    where: { paddleCustomerId: data.customerId },
    select: { organizationId: true },
  });
  if (byCustomerId) return byCustomerId.organizationId;

  return null;
}

async function handleSubscriptionUpdate(
  tx: Tx,
  data: SubscriptionNotification,
  paddleEventId: string,
) {
  const organizationId = await resolveOrgIdForSubscription(tx, data);
  if (!organizationId) {
    // The checkout's customData is the only authoritative source for the
    // very first event on a new subscription. If it's missing AND we have no
    // existing record, ask Paddle to retry — by then the checkout flow will
    // have stored the link.
    throw new RetryableError(
      `Cannot resolve organizationId for subscription ${data.id}`,
    );
  }

  const firstItem = data.items[0];
  const priceId = firstItem?.price?.id;
  if (!priceId) {
    log.warn(
      { subscriptionId: data.id },
      "Subscription event has no price ID on first item, ignoring",
    );
    return;
  }

  const plan = getPlanFromPriceId(priceId);
  const periodStart = data.currentBillingPeriod?.startsAt
    ? new Date(data.currentBillingPeriod.startsAt)
    : null;
  const periodEnd = data.currentBillingPeriod?.endsAt
    ? new Date(data.currentBillingPeriod.endsAt)
    : null;
  const paddleUpdatedAt = data.updatedAt ? new Date(data.updatedAt) : null;

  // Trust Paddle's status verbatim (we spell "cancelled" with two L's
  // internally; everything else matches). A pending cancellation at period
  // end shows up as `scheduledChange.action === "cancel"` while status
  // stays "active" — reflect that as "cancelled" so the UI shows it.
  const rawStatus = data.status as string;
  const scheduledCancel =
    (data as unknown as { scheduledChange?: { action?: string } | null })
      .scheduledChange?.action === "cancel";
  const status =
    rawStatus === "canceled" || scheduledCancel
      ? "cancelled"
      : rawStatus;

  const existing = await tx.subscription.findUnique({
    where: { organizationId },
    select: {
      currentPeriodStart: true,
      paddleUpdatedAt: true,
      plan: true,
      status: true,
    },
  });

  // Enterprise plans are manual-only and never bound to a Paddle subscription.
  // If a webhook somehow resolves to an enterprise org (e.g. a stray checkout
  // with our organizationId in customData), refuse to overwrite it.
  if (existing?.plan === "enterprise") {
    log.warn(
      { organizationId, subscriptionId: data.id },
      "Refusing to overwrite enterprise plan from Paddle webhook",
    );
    return;
  }

  // Out-of-order guard: drop events older than the latest one we applied.
  if (
    existing?.paddleUpdatedAt &&
    paddleUpdatedAt &&
    existing.paddleUpdatedAt.getTime() > paddleUpdatedAt.getTime()
  ) {
    log.info(
      {
        organizationId,
        subscriptionId: data.id,
        applied: existing.paddleUpdatedAt,
        incoming: paddleUpdatedAt,
      },
      "Dropping out-of-order subscription update",
    );
    return;
  }

  const billingPeriodChanged =
    existing?.currentPeriodStart &&
    periodStart &&
    existing.currentPeriodStart.getTime() !== periodStart.getTime();

  await tx.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      paddleCustomerId: data.customerId,
      paddleSubscriptionId: data.id,
      plan,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      paddleUpdatedAt,
      purchasedPacks: 0,
    },
    update: {
      paddleCustomerId: data.customerId,
      paddleSubscriptionId: data.id,
      plan,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      paddleUpdatedAt,
      ...(billingPeriodChanged ? { purchasedPacks: 0 } : {}),
    },
  });

  await recordSubscriptionTransition(tx, {
    organizationId,
    fromPlan: existing?.plan ?? null,
    toPlan: plan,
    fromStatus: existing?.status ?? null,
    toStatus: status,
    occurredAt: paddleUpdatedAt ?? new Date(),
    paddleEventId,
  });

  await enforcePlanLimits(tx, organizationId);

  log.info(
    { organizationId, subscriptionId: data.id, plan, billingPeriodChanged },
    "Subscription updated",
  );
}

// On a plan downgrade, soft-disable the oldest-kept webhooks/channels that
// exceed the new plan's limit. A no-op when the plan allows more than is
// currently enabled (upgrades, steady-state) because the skip() returns no
// rows.
async function enforcePlanLimits(tx: Tx, organizationId: string) {
  const sub = await tx.subscription.findUnique({
    where: { organizationId },
  });
  if (!sub) return;

  const limits = limitsForSubscription(sub);

  if (limits.webhooks !== null) {
    const excess = await tx.webhook.findMany({
      where: { organizationId, enabled: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      skip: limits.webhooks,
      select: { id: true },
    });
    if (excess.length > 0) {
      await tx.webhook.updateMany({
        where: { id: { in: excess.map((w) => w.id) } },
        data: { enabled: false },
      });
      log.info(
        { organizationId, count: excess.length, limit: limits.webhooks },
        "Disabled over-quota webhooks after plan change",
      );
    }
  }

  if (limits.channels !== null) {
    const excess = await tx.channel.findMany({
      where: { organizationId, enabled: true },
      orderBy: { createdAt: "asc" },
      skip: limits.channels,
      select: { id: true },
    });
    if (excess.length > 0) {
      await tx.channel.updateMany({
        where: { id: { in: excess.map((c) => c.id) } },
        data: { enabled: false },
      });
      log.info(
        { organizationId, count: excess.length, limit: limits.channels },
        "Disabled over-quota channels after plan change",
      );
    }
  }
}

async function handleSubscriptionStatus(
  tx: Tx,
  data: SubscriptionNotification,
  status: "cancelled" | "paused" | "past_due",
  paddleEventId: string,
) {
  const organizationId = await resolveOrgIdForSubscription(tx, data);
  if (!organizationId) {
    throw new RetryableError(
      `Cannot resolve organizationId for subscription ${data.id} (${status})`,
    );
  }

  const paddleUpdatedAt = data.updatedAt ? new Date(data.updatedAt) : null;
  const existing = await tx.subscription.findUnique({
    where: { organizationId },
    select: { paddleUpdatedAt: true, plan: true, status: true },
  });

  if (
    existing?.paddleUpdatedAt &&
    paddleUpdatedAt &&
    existing.paddleUpdatedAt.getTime() > paddleUpdatedAt.getTime()
  ) {
    log.info(
      { organizationId, subscriptionId: data.id, status },
      "Dropping out-of-order status event",
    );
    return;
  }

  await tx.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      paddleCustomerId: data.customerId,
      paddleSubscriptionId: data.id,
      plan: "free",
      status,
      paddleUpdatedAt,
    },
    update: { status, paddleUpdatedAt },
  });

  // Status-change webhooks never touch the plan — keep from/to identical so
  // the classifier sees a pure status transition.
  const plan = existing?.plan ?? "free";
  await recordSubscriptionTransition(tx, {
    organizationId,
    fromPlan: existing?.plan ?? null,
    toPlan: plan,
    fromStatus: existing?.status ?? null,
    toStatus: status,
    occurredAt: paddleUpdatedAt ?? new Date(),
    paddleEventId,
  });

  log.info({ organizationId, subscriptionId: data.id, status }, "Subscription status updated");
}

async function handleTransactionCompleted(
  tx: Tx,
  data: TransactionNotification,
) {
  const messagePackPriceId = getMessagePackPriceId();
  if (!messagePackPriceId) return;

  const packItems = data.items.filter(
    (item) => item.price?.id === messagePackPriceId,
  );
  if (packItems.length === 0) return;

  const totalPacks = packItems.reduce((sum, item) => sum + item.quantity, 0);
  if (totalPacks <= 0) return;

  const fromCustomData = (data.customData as Record<string, unknown> | null)
    ?.organizationId;
  let orgId: string | null =
    typeof fromCustomData === "string" ? fromCustomData : null;

  if (!orgId && data.subscriptionId) {
    const bySub = await tx.subscription.findUnique({
      where: { paddleSubscriptionId: data.subscriptionId },
      select: { organizationId: true },
    });
    orgId = bySub?.organizationId ?? null;
  }
  if (!orgId && data.customerId) {
    const byCustomer = await tx.subscription.findUnique({
      where: { paddleCustomerId: data.customerId },
      select: { organizationId: true },
    });
    orgId = byCustomer?.organizationId ?? null;
  }

  if (!orgId) {
    throw new RetryableError(
      `Cannot resolve organizationId for transaction ${data.id}`,
    );
  }

  await tx.subscription.update({
    where: { organizationId: orgId },
    data: { purchasedPacks: { increment: totalPacks } },
  });

  log.info(
    { organizationId: orgId, packs: totalPacks },
    "Message pack transaction confirmed",
  );
}
