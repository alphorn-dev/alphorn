import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { deleteMessagesBefore } from "@/worker/retention";

async function seedOrgWithMessages(ages: number[]) {
  const orgId = `org_${nanoid(10)}`;
  await prisma.organization.create({ data: { id: orgId, name: "Retention Org" } });
  const webhook = await prisma.webhook.create({
    data: {
      id: `wh_${nanoid(10)}`,
      name: "Retention webhook",
      apiKeyHash: `hash_${nanoid(20)}`,
      apiKeyPrefix: "alp_test",
      publicId: nanoid(12),
      organizationId: orgId,
    },
  });
  const day = 24 * 60 * 60 * 1000;
  await prisma.message.createMany({
    data: ages.map((days) => ({
      webhookId: webhook.id,
      message: "m",
      createdAt: new Date(Date.now() - days * day),
    })),
  });
  return { orgId, webhookId: webhook.id };
}

describe("deleteMessagesBefore", () => {
  it("deletes only the given orgs' messages older than the cutoff", async () => {
    const a = await seedOrgWithMessages([10, 9, 8, 1]);
    const b = await seedOrgWithMessages([10]);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    expect(await deleteMessagesBefore([a.orgId], cutoff)).toBe(3);
    expect(await prisma.message.count({ where: { webhookId: a.webhookId } })).toBe(1);
    expect(await prisma.message.count({ where: { webhookId: b.webhookId } })).toBe(1);
  });

  it("keeps going across batches", async () => {
    const a = await seedOrgWithMessages(Array.from({ length: 2500 }, () => 30));
    expect(await deleteMessagesBefore([a.orgId], new Date())).toBe(2500);
    expect(await prisma.message.count({ where: { webhookId: a.webhookId } })).toBe(0);
  });
});
