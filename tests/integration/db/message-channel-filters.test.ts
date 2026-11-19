import { describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { createDeliveryFixture } from "../helpers/factories";

const auth = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/server", () => ({
  requireSession: async () => ({ session: { activeOrganizationId: auth.orgId } }),
  requireOrgSession: async () => ({ orgId: auth.orgId }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getMessagesForOrg } from "@/app/(dashboard)/messages/actions";
import { getChannelDeliveryStats } from "@/app/(dashboard)/channels/actions";

// One message per case: A failed on channel 1, B failed on channel 2 but
// delivered on channel 1.
async function setup() {
  const f = await createDeliveryFixture();
  auth.orgId = f.organizationId;
  const ch2 = await prisma.channel.create({
    data: {
      id: `ch_${nanoid(10)}`,
      name: "Second",
      type: "webhook",
      config: {},
      publicId: nanoid(12),
      organizationId: f.organizationId,
    },
  });
  await prisma.delivery.update({ where: { id: f.deliveryId }, data: { status: "FAILED", lastError: "boom A" } });
  const b = await prisma.message.create({ data: { webhookId: f.webhookId, title: "B", message: "b" } });
  await prisma.delivery.createMany({
    data: [
      { messageId: b.id, channelId: f.channelId, status: "DELIVERED" },
      { messageId: b.id, channelId: ch2.id, status: "FAILED", lastError: "boom B" },
    ],
  });
  return { f, ch2, aId: f.messageId, bId: b.id };
}

const ids = (r: { messages: { id: string }[] }) => r.messages.map((m) => m.id).sort();

describe("getMessagesForOrg channel filter", () => {
  it("returns messages with any delivery to the channel", async () => {
    const { f, aId, bId } = await setup();
    expect(ids(await getMessagesForOrg({ channel: f.channelId }))).toEqual([aId, bId].sort());
  });

  it("combines channel and status on the same delivery", async () => {
    const { f, ch2, aId, bId } = await setup();
    // B failed, but not on channel 1, so only A matches.
    expect(ids(await getMessagesForOrg({ channel: f.channelId, status: "FAILED" }))).toEqual([aId]);
    expect(ids(await getMessagesForOrg({ channel: ch2.id, status: "FAILED" }))).toEqual([bId]);
    expect(ids(await getMessagesForOrg({ channel: ch2.id, status: "DELIVERED" }))).toEqual([]);
  });

  it("does not leak messages from another organization's channel", async () => {
    const { f } = await setup();
    auth.orgId = (await createDeliveryFixture()).organizationId;
    expect(ids(await getMessagesForOrg({ channel: f.channelId }))).toEqual([]);
  });
});

describe("getChannelDeliveryStats", () => {
  it("counts outcomes and reports the latest failure", async () => {
    const { f } = await setup();
    const stats = await getChannelDeliveryStats(f.channelId);
    expect(stats).toMatchObject({ delivered: 1, failed: 1, pending: 0, successRate: 50 });
    expect(stats.lastFailure?.lastError).toBe("boom A");
  });

  it("has no rate without finished deliveries and ignores old ones", async () => {
    const { f } = await setup();
    await prisma.delivery.updateMany({
      where: { channelId: f.channelId },
      data: { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });
    await prisma.delivery.create({ data: { messageId: f.messageId, channelId: f.channelId, status: "PENDING" } });
    const stats = await getChannelDeliveryStats(f.channelId);
    expect(stats).toMatchObject({ delivered: 0, failed: 0, pending: 1, successRate: null, lastFailure: null });
  });

  it("returns nothing for another organization's channel", async () => {
    const { f } = await setup();
    auth.orgId = (await createDeliveryFixture()).organizationId;
    expect(await getChannelDeliveryStats(f.channelId)).toMatchObject({ delivered: 0, failed: 0, lastFailure: null });
  });
});
