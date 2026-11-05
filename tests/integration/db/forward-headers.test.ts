import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { persistMessageAndEnqueueDeliveries } from "@/lib/delivery";
import { handleDelivery } from "@/worker/deliver";
import { TEST_CHANNEL_TYPE, testChannelCalls } from "../helpers/test-channel";

async function seed() {
  const orgId = `org_${nanoid(10)}`;
  await prisma.organization.create({ data: { id: orgId, name: "Forward Org" } });
  const webhook = await prisma.webhook.create({
    data: {
      id: `wh_${nanoid(10)}`,
      name: "Forward webhook",
      apiKeyHash: `hash_${nanoid(20)}`,
      apiKeyPrefix: "alp_test",
      publicId: nanoid(12),
      organizationId: orgId,
    },
  });
  const channel = await prisma.channel.create({
    data: {
      id: `ch_${nanoid(10)}`,
      name: "Forward channel",
      type: TEST_CHANNEL_TYPE,
      config: {},
      publicId: nanoid(12),
      organizationId: orgId,
    },
  });
  return { webhookId: webhook.id, channelId: channel.id };
}

describe("forward headers: persist and deliver", () => {
  it("stores request headers on the message and hands them to the channel", async () => {
    const { webhookId, channelId } = await seed();
    const headers = { "content-type": "application/json", "x-github-event": "push" };

    const { messageId } = await persistMessageAndEnqueueDeliveries({
      webhookId,
      title: "t",
      message: "m",
      priority: null,
      tags: [],
      payload: { ref: "refs/heads/main" },
      headers,
      channelIds: [channelId],
    });

    const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(message.headers).toEqual(headers);

    const delivery = await prisma.delivery.findFirstOrThrow({ where: { messageId } });
    await handleDelivery({ deliveryId: delivery.id });

    const call = testChannelCalls().at(-1)!;
    expect(call.notification.headers).toEqual(headers);
    expect(call.notification.payload).toEqual({ ref: "refs/heads/main" });
  });

  it("stores null when no headers are given (e.g. UI test messages)", async () => {
    const { webhookId, channelId } = await seed();
    const { messageId } = await persistMessageAndEnqueueDeliveries({
      webhookId,
      title: "t",
      message: "m",
      priority: null,
      tags: [],
      payload: null,
      channelIds: [channelId],
    });
    const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(message.headers).toBeNull();
  });
});
