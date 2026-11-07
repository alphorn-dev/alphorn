import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { persistMessageAndEnqueueDeliveries } from "@/lib/delivery";
import { countMessagesInPeriod } from "@/lib/billing/subscription";

async function seedWebhook() {
  const orgId = `org_${nanoid(10)}`;
  await prisma.organization.create({ data: { id: orgId, name: "Usage Org" } });
  const webhook = await prisma.webhook.create({
    data: {
      id: `wh_${nanoid(10)}`,
      name: "Usage webhook",
      apiKeyHash: `hash_${nanoid(20)}`,
      apiKeyPrefix: "alp_test",
      publicId: nanoid(12),
      organizationId: orgId,
    },
  });
  return { orgId, webhookId: webhook.id };
}

const persist = (webhookId: string) =>
  persistMessageAndEnqueueDeliveries({
    webhookId,
    title: null,
    message: "m",
    priority: null,
    tags: [],
    payload: null,
    channelIds: [],
  });

describe("message usage counter", () => {
  it("counts persisted messages and keeps counting after retention deletes them", async () => {
    const { orgId, webhookId } = await seedWebhook();
    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await persist(webhookId);
    await persist(webhookId);
    await persist(webhookId);
    expect(await countMessagesInPeriod(orgId, periodStart)).toBe(3);

    // Retention sweep: messages go, the quota usage must not.
    await prisma.message.deleteMany({ where: { webhookId } });
    expect(await countMessagesInPeriod(orgId, periodStart)).toBe(3);
  });

  it("ignores usage from before the period start", async () => {
    const { orgId, webhookId } = await seedWebhook();
    await persist(webhookId);
    expect(await countMessagesInPeriod(orgId, new Date(Date.now() + 2 * 60 * 60 * 1000))).toBe(0);
  });

  it("keeps orgs apart", async () => {
    const a = await seedWebhook();
    const b = await seedWebhook();
    await persist(a.webhookId);
    expect(await countMessagesInPeriod(b.orgId, new Date(0))).toBe(0);
  });
});
