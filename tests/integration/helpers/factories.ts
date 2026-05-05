import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { TEST_CHANNEL_TYPE } from "./test-channel";

interface Fixture {
  organizationId: string;
  webhookId: string;
  channelId: string;
  messageId: string;
  deliveryId: string;
}

export interface CreateDeliveryOptions {
  channelEnabled?: boolean;
  channelType?: string;
  channelConfig?: Record<string, unknown>;
  messageTitle?: string | null;
  messageBody?: string;
  failureNotificationChannelId?: string | null;
}

export async function createDeliveryFixture(
  options: CreateDeliveryOptions = {},
): Promise<Fixture> {
  const orgId = `org_${nanoid(10)}`;
  await prisma.organization.create({
    data: { id: orgId, name: `Test Org ${orgId}` },
  });

  if (options.failureNotificationChannelId !== undefined) {
    await prisma.organizationSettings.create({
      data: {
        organizationId: orgId,
        failureNotificationChannelId: options.failureNotificationChannelId,
      },
    });
  }

  const webhook = await prisma.webhook.create({
    data: {
      id: `wh_${nanoid(10)}`,
      name: "Test webhook",
      apiKey: `key_${nanoid(20)}`,
      publicId: nanoid(12),
      organizationId: orgId,
    },
  });

  const channel = await prisma.channel.create({
    data: {
      id: `ch_${nanoid(10)}`,
      name: "Test channel",
      type: options.channelType ?? TEST_CHANNEL_TYPE,
      config: (options.channelConfig ?? {}) as object,
      publicId: nanoid(12),
      organizationId: orgId,
      enabled: options.channelEnabled ?? true,
    },
  });

  const message = await prisma.message.create({
    data: {
      webhookId: webhook.id,
      title: options.messageTitle ?? "Hello",
      message: options.messageBody ?? "World",
    },
  });

  const delivery = await prisma.delivery.create({
    data: {
      messageId: message.id,
      channelId: channel.id,
    },
  });

  return {
    organizationId: orgId,
    webhookId: webhook.id,
    channelId: channel.id,
    messageId: message.id,
    deliveryId: delivery.id,
  };
}
