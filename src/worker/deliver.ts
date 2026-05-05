import { prisma } from "@/lib/db";
import { getChannel } from "@/channels";
import { isPermanentChannelError } from "@/channels/errors";
import { notifyFailure } from "./failure-notifier";
import type { Notification } from "@/channels/types";
import { logger as rootLogger } from "@/lib/logger";

const MAX_RETRIES = 5;

export interface DeliveryJobData {
  deliveryId: string;
  trace?: string[];
}

export async function handleDelivery(data: DeliveryJobData): Promise<void> {
  const delivery = await prisma.delivery.findUnique({
    where: { id: data.deliveryId },
    include: {
      channel: true,
      message: true,
    },
  });

  const logger = rootLogger.child({
    component: "worker",
    deliveryId: data.deliveryId,
  });

  if (!delivery) {
    logger.error("Delivery not found");
    throw new Error(`Delivery ${data.deliveryId} not found`);
  }

  const jobLogger = logger.child({
    channelId: delivery.channelId,
    channelType: delivery.channel.type,
    messageId: delivery.messageId,
    attempt: delivery.attempts + 1,
  });

  // Idempotency: only claim PENDING/FAILED rows. A DELIVERED row means the
  // channel already accepted this notification (pg-boss can redeliver after a
  // crash between send success and job ack); a PROCESSING row means another
  // worker is already handling it. Either way, do not re-send.
  const claim = await prisma.delivery.updateMany({
    where: {
      id: delivery.id,
      status: { in: ["PENDING", "FAILED"] },
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
    },
  });

  if (claim.count === 0) {
    jobLogger.info(
      { status: delivery.status },
      "Skipping delivery — not in a claimable state",
    );
    return;
  }

  jobLogger.debug({ channelName: delivery.channel.name }, "Delivery processing");

  const handler = getChannel(delivery.channel.type);
  if (!handler) {
    jobLogger.error({ channelType: delivery.channel.type }, "Unknown channel type");
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        lastError: `Unknown channel type: ${delivery.channel.type}`,
      },
    });
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
    await handler.send(delivery.channel.config, notification, {
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
      await notifyFailure(delivery.id);
      return;
    }

    if (updated.attempts >= MAX_RETRIES) {
      jobLogger.error({ error: errorMessage, err, attempts: updated.attempts, maxRetries: MAX_RETRIES }, "Delivery permanently failed");
      await notifyFailure(delivery.id);
    } else {
      jobLogger.warn({ error: errorMessage, attempts: updated.attempts }, "Delivery failed, will retry");
      throw err;
    }
  }
}
