import { nanoid } from "nanoid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { TEST_CHANNEL_TYPE } from "../helpers/test-channel";

// Billing on: getOrgLimits applies the free plan (3 webhooks, 3 channels).
process.env.PADDLE_API_KEY = "pdl_test_api_key";
process.env.PADDLE_WEBHOOK_SECRET = "pdl_test_webhook_secret";
process.env.PADDLE_PRICE_ID_PRO = "pri_test_pro";
process.env.PADDLE_PRICE_ID_BUSINESS = "pri_test_business";
process.env.PADDLE_PRICE_ID_MESSAGE_PACK = "pri_test_pack";
process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "test_client_token";

const auth = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminOrOwner: async () => ({ orgId: auth.orgId }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { updateChannel } from "@/app/(dashboard)/channels/actions";
import { updateWebhook } from "@/app/(dashboard)/webhooks/actions";

async function createChannel(enabled: boolean) {
  return prisma.channel.create({
    data: {
      id: `ch_${nanoid(10)}`,
      name: "c",
      type: TEST_CHANNEL_TYPE,
      config: {},
      publicId: nanoid(12),
      organizationId: auth.orgId,
      enabled,
    },
  });
}

async function createWebhook(enabled: boolean) {
  return prisma.webhook.create({
    data: {
      id: `wh_${nanoid(10)}`,
      name: "w",
      apiKeyHash: `hash_${nanoid(20)}`,
      apiKeyPrefix: "alp_test",
      publicId: nanoid(12),
      organizationId: auth.orgId,
      enabled,
    },
  });
}

beforeEach(async () => {
  auth.orgId = `org_${nanoid(10)}`;
  await prisma.organization.create({ data: { id: auth.orgId, name: "Limits org" } });
});

describe("re-enabling respects plan limits", () => {
  it("refuses to enable a channel when the enabled count is at the limit", async () => {
    for (let i = 0; i < 3; i++) await createChannel(true);
    const disabled = await createChannel(false);

    await expect(
      updateChannel(disabled.id, { name: "c", config: {}, enabled: true }),
    ).rejects.toThrow(/Channel limit reached/);

    // Below the limit (one enabled channel disabled) it goes through.
    const [first] = await prisma.channel.findMany({ where: { organizationId: auth.orgId, enabled: true } });
    await prisma.channel.update({ where: { id: first.id }, data: { enabled: false } });
    await updateChannel(disabled.id, { name: "c", config: {}, enabled: true });
    expect((await prisma.channel.findUniqueOrThrow({ where: { id: disabled.id } })).enabled).toBe(true);
  });

  it("refuses to enable a webhook when the enabled count is at the limit", async () => {
    for (let i = 0; i < 3; i++) await createWebhook(true);
    const disabled = await createWebhook(false);

    await expect(
      updateWebhook(disabled.id, { name: "w", enabled: true, requireAuth: true, channelIds: [] }),
    ).rejects.toThrow(/Webhook limit reached/);
  });
});
