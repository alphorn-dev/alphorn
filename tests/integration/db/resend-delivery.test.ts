import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createDeliveryFixture } from "../helpers/factories";

const auth = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminOrOwner: async () => ({ orgId: auth.orgId }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { resendDelivery } from "@/app/(dashboard)/messages/actions";

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
