import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  _resetWebhookCacheForTests,
  getCachedWebhook,
} from "@/lib/webhook-cache";
import { createDeliveryFixture } from "../helpers/factories";

describe("Webhook soft-delete", () => {
  it("hides the webhook from the receiver cache while retaining history", async () => {
    const fixture = await createDeliveryFixture();

    const webhook = await prisma.webhook.findUniqueOrThrow({
      where: { id: fixture.webhookId },
    });

    _resetWebhookCacheForTests();
    const cachedBefore = await getCachedWebhook(webhook.publicId);
    expect(cachedBefore?.id).toBe(fixture.webhookId);

    await prisma.webhook.update({
      where: { id: fixture.webhookId },
      data: { deletedAt: new Date(), enabled: false },
    });

    // Flush the in-process cache — in prod this happens via the
    // alphorn_cache_invalidate NOTIFY trigger; in tests we drive it manually.
    _resetWebhookCacheForTests();
    const cachedAfter = await getCachedWebhook(webhook.publicId);
    expect(cachedAfter).toBeNull();

    // History must survive the tombstone.
    const message = await prisma.message.findUnique({
      where: { id: fixture.messageId },
    });
    const delivery = await prisma.delivery.findUnique({
      where: { id: fixture.deliveryId },
    });
    expect(message).not.toBeNull();
    expect(delivery).not.toBeNull();
  });
});
