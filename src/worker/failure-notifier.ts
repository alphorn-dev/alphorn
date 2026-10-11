import { prisma } from "@/lib/db";
import { getChannel } from "@/channels";
import { logger as rootLogger } from "@/lib/logger";

/**
 * The failed delivery, already loaded by the caller with its channel and the
 * message's webhook name. Passed in to avoid a redundant refetch.
 */
export interface FailedDelivery {
  id: string;
  channelId: string;
  attempts: number;
  lastError: string | null;
  channel: { name: string; type: string; organizationId: string };
  message: { title: string | null; webhook: { name: string } };
}

/**
 * Check if the organization has a failure notification channel configured.
 * If so, send a failure alert.
 */
export async function notifyFailure(delivery: FailedDelivery): Promise<void> {
  const logger = rootLogger.child({ component: "worker", deliveryId: delivery.id });

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

  if (!failureChannel || !failureChannel.enabled || failureChannel.deletedAt) return;

  const handler = getChannel(failureChannel.type);
  if (!handler) return;

  try {
    // Parse first so the failure channel gets the same Zod defaults/coercion
    // every other send path applies (mirrors deliver.ts). A parse failure or
    // unknown handler is swallowed by the catch — a broken failure channel
    // must not crash the delivery that triggered this notification.
    const config = handler.configSchema.parse(failureChannel.config);
    await handler.send(config, {
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
      deliveryId: delivery.id,
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
