import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { persistMessageAndEnqueueDeliveries } from "@/lib/delivery";
import { DELIVERY_QUEUE, getQueue } from "@/lib/queue";
import { TEST_CHANNEL_TYPE } from "../helpers/test-channel";

interface DeliveryJobPayload {
  deliveryId: string;
  trace?: string[];
}

async function seedWebhookWithChannels(count: number) {
  const orgId = `org_${nanoid(10)}`;
  await prisma.organization.create({
    data: { id: orgId, name: "Enqueue Org" },
  });

  const webhook = await prisma.webhook.create({
    data: {
      id: `wh_${nanoid(10)}`,
      name: "Enqueue webhook",
      apiKey: `key_${nanoid(20)}`,
      publicId: nanoid(12),
      organizationId: orgId,
    },
  });

  const channelIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const ch = await prisma.channel.create({
      data: {
        id: `ch_${nanoid(10)}`,
        name: `Enqueue channel ${i}`,
        type: TEST_CHANNEL_TYPE,
        config: {},
        publicId: nanoid(12),
        organizationId: orgId,
      },
    });
    channelIds.push(ch.id);
  }

  return { webhookId: webhook.id, channelIds };
}

describe("persistMessageAndEnqueueDeliveries — integration", () => {
  it("inserts Message + Deliveries in one round-trip and enqueues one pg-boss job per delivery", async () => {
    const { webhookId, channelIds } = await seedWebhookWithChannels(3);

    const { messageId } = await persistMessageAndEnqueueDeliveries({
      webhookId,
      title: "t",
      message: "m",
      priority: 5,
      tags: ["a", "b"],
      payload: { hello: "world" },
      channelIds,
    });

    const message = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
    });
    expect(message.priority).toBe(5);
    expect(message.tags).toEqual(["a", "b"]);
    expect(message.payload).toEqual({ hello: "world" });

    const deliveries = await prisma.delivery.findMany({
      where: { messageId },
      orderBy: { channelId: "asc" },
    });
    expect(deliveries).toHaveLength(3);
    expect(deliveries.every((d) => d.status === "PENDING")).toBe(true);
    expect(new Set(deliveries.map((d) => d.channelId))).toEqual(
      new Set(channelIds),
    );

    const boss = await getQueue();
    const jobs = await boss.findJobs<DeliveryJobPayload>(DELIVERY_QUEUE, {
      queued: true,
    });
    expect(jobs).toHaveLength(3);

    const enqueuedDeliveryIds = jobs.map((j) => j.data.deliveryId).sort();
    expect(enqueuedDeliveryIds).toEqual(deliveries.map((d) => d.id).sort());
    expect(jobs.every((j) => j.data.trace === undefined)).toBe(true);
  });

  it("propagates the trace array onto every enqueued job", async () => {
    const { webhookId, channelIds } = await seedWebhookWithChannels(2);
    const trace = ["hop_a", "hop_b"];

    await persistMessageAndEnqueueDeliveries({
      webhookId,
      title: null,
      message: "m",
      priority: null,
      tags: [],
      payload: null,
      channelIds,
      trace,
    });

    const boss = await getQueue();
    const jobs = await boss.findJobs<DeliveryJobPayload>(DELIVERY_QUEUE, {
      queued: true,
    });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => Array.isArray(j.data.trace))).toBe(true);
    expect(jobs[0]!.data.trace).toEqual(trace);
  });

  it("writes the Message but enqueues nothing when channelIds is empty", async () => {
    const { webhookId } = await seedWebhookWithChannels(0);

    const { messageId } = await persistMessageAndEnqueueDeliveries({
      webhookId,
      title: null,
      message: "no fanout",
      priority: null,
      tags: [],
      payload: null,
      channelIds: [],
    });

    const deliveries = await prisma.delivery.findMany({ where: { messageId } });
    expect(deliveries).toHaveLength(0);

    const boss = await getQueue();
    const jobs = await boss.findJobs<DeliveryJobPayload>(DELIVERY_QUEUE, {
      queued: true,
    });
    expect(jobs).toHaveLength(0);
  });
});
