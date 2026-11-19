import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createDeliveryFixture } from "../helpers/factories";

const auth = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminOrOwner: async () => ({ orgId: auth.orgId }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { resendDelivery, resendFailedDeliveries } from "@/app/(dashboard)/messages/actions";

describe("resendDelivery", () => {
  it("refuses deliveries past the 24h retry window instead of leaving them PENDING", async () => {
    const fixture = await createDeliveryFixture();
    auth.orgId = fixture.organizationId;
    await prisma.delivery.update({
      where: { id: fixture.deliveryId },
      data: { status: "FAILED", createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    await expect(resendDelivery(fixture.deliveryId)).rejects.toThrow(
      "Deliveries older than 24 hours can't be resent",
    );
    const after = await prisma.delivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
    expect(after.status).toBe("FAILED");
  });
});

describe("resendFailedDeliveries", () => {
  it("re-queues failed and stale deliveries but leaves delivered and expired ones alone", async () => {
    const fixture = await createDeliveryFixture();
    auth.orgId = fixture.organizationId;
    await prisma.delivery.update({
      where: { id: fixture.deliveryId },
      data: { status: "FAILED", lastError: "boom" },
    });
    const extra = (status: "STALE" | "DELIVERED" | "FAILED", createdAt = new Date()) =>
      prisma.delivery.create({
        data: { messageId: fixture.messageId, channelId: fixture.channelId, status, createdAt },
      });
    const stale = await extra("STALE");
    const delivered = await extra("DELIVERED");
    const expired = await extra("FAILED", new Date(Date.now() - 25 * 60 * 60 * 1000));

    await expect(resendFailedDeliveries(fixture.messageId)).resolves.toBe(2);

    const status = async (id: string) =>
      (await prisma.delivery.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(fixture.deliveryId)).toBe("PENDING");
    expect(await status(stale.id)).toBe("PENDING");
    expect(await status(delivered.id)).toBe("DELIVERED");
    expect(await status(expired.id)).toBe("FAILED");
  });

  it("refuses when nothing can be resent", async () => {
    const fixture = await createDeliveryFixture();
    auth.orgId = fixture.organizationId;
    await expect(resendFailedDeliveries(fixture.messageId)).rejects.toThrow(
      "No failed deliveries can be resent",
    );
  });

  it("does not touch another organization's deliveries", async () => {
    const fixture = await createDeliveryFixture();
    await prisma.delivery.update({ where: { id: fixture.deliveryId }, data: { status: "FAILED" } });
    auth.orgId = (await createDeliveryFixture()).organizationId;
    await expect(resendFailedDeliveries(fixture.messageId)).rejects.toThrow();
    const after = await prisma.delivery.findUniqueOrThrow({ where: { id: fixture.deliveryId } });
    expect(after.status).toBe("FAILED");
  });
});
