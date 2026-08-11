import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getQueue, DELIVERY_QUEUE } from "@/lib/queue";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getChannel } from "@/channels";
import { isPermanentChannelError, PermanentChannelError } from "@/channels/errors";
import { notifyFailure } from "./failure-notifier";
import type { Notification } from "@/channels/types";
import { logger as rootLogger } from "@/lib/logger";

export const MAX_RETRIES = 5;

// Conservative per-channel-type send caps (deliveries per minute), keyed by
// channel registry type. Channels not listed are unthrottled. Enforced via the
// shared Postgres RateLimit table (per channelId) so the cap holds across
// worker instances. A throttled delivery is rescheduled without consuming a
// retry — it does not fail. ponytail: fixed per-minute window + global
// defaults; make per-channel-configurable when users need to tune it.
export const CHANNEL_RATE_LIMITS_PER_MIN: Record<string, number> = {
  slack: 60, // Slack incoming webhooks ~1 msg/s
  telegram: 20, // Telegram ~20 msg/min per group
  discord: 50, // Discord webhooks ~5/s, kept conservative
};

// Retry window: a delivery older than this is never sent, no matter what
// state it is in or when its job arrives. Shared with the sweep in ./sweep.ts.
export const MAX_DELIVERY_AGE_MS = 24 * 60 * 60 * 1000;

export interface DeliveryJobData {
  deliveryId: string;
  trace?: string[];
}

export async function handleDelivery(data: DeliveryJobData): Promise<void> {
  const logger = rootLogger.child({
    component: "worker",
    deliveryId: data.deliveryId,
  });

  // Idempotency: only claim rows still eligible to send. PENDING/FAILED are
  // the normal lifecycle states; STALE means the sweep marked the row as not
  // picked up in time — its job can still arrive late (worker downtime,
  // backlog), so it stays claimable within the 24h retry window. Nothing
  // older than 24h is ever sent: expired rows stay STALE/FAILED. A DELIVERED
  // row means the channel already accepted this notification (pg-boss can
  // redeliver after a crash between send success and job ack); a PROCESSING
  // row means another worker is already handling it. Either way, do not
  // re-send. Claiming before loading the full delivery (incl. the message's
  // jsonb payload) avoids that load on the common already-delivered-
  // redelivery path.
  const claim = await prisma.delivery.updateMany({
    where: {
      id: data.deliveryId,
      status: { in: ["PENDING", "FAILED", "STALE"] },
      createdAt: { gte: new Date(Date.now() - MAX_DELIVERY_AGE_MS) },
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
    },
  });

  if (claim.count === 0) {
    const existing = await prisma.delivery.findUnique({
      where: { id: data.deliveryId },
      select: { status: true },
    });
    if (!existing) {
      logger.error("Delivery not found");
      throw new Error(`Delivery ${data.deliveryId} not found`);
    }
    logger.info(
      { status: existing.status },
      "Skipping delivery — not in a claimable state",
    );
    return;
  }

  const delivery = await prisma.delivery.findUnique({
    where: { id: data.deliveryId },
    include: {
      channel: true,
      message: { include: { webhook: { select: { name: true } } } },
    },
  });

  if (!delivery) {
    logger.error("Delivery not found after claim");
    throw new Error(`Delivery ${data.deliveryId} not found`);
  }

  const jobLogger = logger.child({
    channelId: delivery.channelId,
    channelType: delivery.channel.type,
    messageId: delivery.messageId,
    attempt: delivery.attempts + 1,
  });

  jobLogger.debug({ channelName: delivery.channel.name }, "Delivery processing");

  // Per-channel throttle. Checked after the claim so the channel type is known
  // without an extra hot-path query; when over the cap we release the claim
  // (back to PENDING, undo the attempt increment) and reschedule with a delay,
  // so throttling never counts as a failed retry. enforceRateLimit only
  // increments its counter on the allowed branch, so throttled ticks are free.
  const rateLimit = CHANNEL_RATE_LIMITS_PER_MIN[delivery.channel.type];
  if (rateLimit) {
    try {
      await enforceRateLimit(`channel-send:${delivery.channelId}`, rateLimit, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        await prisma.delivery.update({
          where: { id: delivery.id },
          data: { status: "PENDING", attempts: { decrement: 1 } },
        });
        const delaySec = Math.max(1, Math.ceil(err.retryAfterMs / 1000));
        const queue = await getQueue();
        await queue.insert(DELIVERY_QUEUE, [
          {
            data: { deliveryId: delivery.id, trace: data.trace },
            startAfter: delaySec,
          },
        ]);
        jobLogger.info({ delaySec }, "Delivery throttled — rescheduled");
        return;
      }
      throw err;
    }
  }

  const handler = getChannel(delivery.channel.type);
  if (!handler) {
    jobLogger.error({ channelType: delivery.channel.type }, "Unknown channel type");
    const updated = await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        lastError: `Unknown channel type: ${delivery.channel.type}`,
      },
    });
    await notifyFailure({ ...delivery, ...updated });
    return;
  }

  const notification: Notification = {
    title: delivery.message.title,
    message: delivery.message.message,
    priority: delivery.message.priority ?? undefined,
    tags: delivery.message.tags.length > 0 ? delivery.message.tags : undefined,
    payload: (delivery.message.payload as Record<string, unknown>) || undefined,
  };

  try {
    // A ZodError here means the stored config drifted from the schema (hand
    // edit, migration). Invalid config is permanent per the channel contract,
    // so surface it as PermanentChannelError to short-circuit retries.
    let config: unknown;
    try {
      config = handler.configSchema.parse(delivery.channel.config);
    } catch (parseErr) {
      if (parseErr instanceof ZodError) {
        throw new PermanentChannelError(`Invalid channel config: ${parseErr.message}`);
      }
      throw parseErr;
    }
    await handler.send(config, notification, {
      channelId: delivery.channelId,
      deliveryId: delivery.id,
      trace: data.trace,
    });

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });

    jobLogger.debug({ channelName: delivery.channel.name }, "Delivery succeeded");
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    const updated = await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        lastError: errorMessage,
      },
    });

    const permanent = isPermanentChannelError(err);

    if (permanent) {
      jobLogger.error({ error: errorMessage, err, attempts: updated.attempts }, "Delivery permanently failed (non-retryable)");
      await notifyFailure({ ...delivery, ...updated });
      return;
    }

    if (updated.attempts >= MAX_RETRIES) {
      jobLogger.error({ error: errorMessage, err, attempts: updated.attempts, maxRetries: MAX_RETRIES }, "Delivery permanently failed");
      await notifyFailure({ ...delivery, ...updated });
    } else {
      jobLogger.warn({ error: errorMessage, attempts: updated.attempts }, "Delivery failed, will retry");
      throw err;
    }
  }
}
