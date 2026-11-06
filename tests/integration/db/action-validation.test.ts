import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const auth = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminOrOwner: async () => ({ orgId: auth.orgId }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createWebhook } from "@/app/(dashboard)/webhooks/actions";
import { createChannel } from "@/app/(dashboard)/channels/actions";

async function org() {
  auth.orgId = `org_${nanoid(10)}`;
  await prisma.organization.create({ data: { id: auth.orgId, name: "Validation org" } });
}

describe("server action input validation", () => {
  it("rejects over-long webhook and channel names", async () => {
    await org();
    await expect(createWebhook({ name: "x".repeat(101), channelIds: [] })).rejects.toThrow();
    await expect(createWebhook({ name: "  ", channelIds: [] })).rejects.toThrow();
    await expect(
      createChannel({ name: "x".repeat(101), type: "ntfy", config: { url: "https://ntfy.sh", topic: "t" } }),
    ).rejects.toThrow();
    expect(await prisma.webhook.count({ where: { organizationId: auth.orgId } })).toBe(0);
  });

  it("stores the parsed filter, not extra keys sent by the client", async () => {
    await org();
    const channelId = `ch_${nanoid(10)}`;
    await prisma.channel.create({
      data: { id: channelId, name: "c", type: "ntfy", config: {}, publicId: nanoid(), organizationId: auth.orgId },
    });
    const filter = {
      groups: [{ conditions: [{ field: "tags", operator: "has_any_of", value: ["deploy"], junk: "x".repeat(1000) }] }],
      extra: { nested: true },
    };
    const { id } = await createWebhook({
      name: "  Deploys  ",
      channelIds: [channelId],
      channelFilters: { [channelId]: filter as never },
    });

    const webhook = await prisma.webhook.findUniqueOrThrow({ where: { id }, include: { channels: true } });
    expect(webhook.name).toBe("Deploys");
    expect(webhook.channels[0].filter).toEqual({
      groups: [{ conditions: [{ field: "tags", operator: "has_any_of", value: ["deploy"] }] }],
    });
  });
});
