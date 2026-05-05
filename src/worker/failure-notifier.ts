import { prisma } from "@/lib/db";
import { getChannel } from "@/channels";
import { logger as rootLogger } from "@/lib/logger";

/**
 * Check if the organization has a failure notification channel configured.
 * If so, send a failure alert.
 */
export async function notifyFailure(deliveryId: string): Promise<void> {
  const logger = rootLogger.child({ component: "worker", deliveryId });

  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      channel: true,
      message: {
        include: {
          webhook: true,
        },
      },
    },
  });

  if (!delivery) {
    logger.warn("Delivery not found for failure notification");
    return;
  }

  const orgId = delivery.channel.organizationId;
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: orgId },
  });

  if (!settings?.failureNotificationChannelId) {
    logger.debug({ organizationId: orgId }, "No failure notification channel configured");
    return;
  }

  // Don't create infinite loops — skip if the failure channel is the same as the failed channel
  if (settings.failureNotificationChannelId === delivery.channelId) return;

  const failureChannel = await prisma.channel.findUnique({
    where: { id: settings.failureNotificationChannelId },
  });

  if (!failureChannel || !failureChannel.enabled) return;

  const handler = getChannel(failureChannel.type);
  if (!handler) return;

  try {
    await handler.send(failureChannel.config, {
      title: "Delivery failed",
      message: [
        `Webhook: ${delivery.message.webhook.name}`,
        `Channel: ${delivery.channel.name} (${delivery.channel.type})`,
        `Message: ${delivery.message.title}`,
        `Error: ${delivery.lastError || "Unknown"}`,
        `Attempts: ${delivery.attempts}`,
      ].join("\n"),
    }, {
      channelId: failureChannel.id,
      deliveryId: deliveryId,
    });
    logger.info(
      { failureChannelId: failureChannel.id, failureChannelType: failureChannel.type },
      "Failure notification sent"
    );
  } catch (err) {
    // Silently fail — we don't want failure notifications to cause more failures
    logger.error({ error: err instanceof Error ? err.message : "Unknown error", failureChannelId: failureChannel.id, failureChannelType: failureChannel.type }, "Failed to send failure notification");
  }
}
