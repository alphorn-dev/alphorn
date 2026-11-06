import { prisma } from "@/lib/db";
import { getOrgLimits } from "@/lib/billing/subscription";

/** Throws when the project is at its plan's webhook limit (hosted only; self-hosted has none). */
export async function assertWebhookLimit(orgId: string): Promise<void> {
  const limits = await getOrgLimits(orgId);
  if (limits?.webhooks === null || limits?.webhooks === undefined) return;
  const currentCount = await prisma.webhook.count({
    where: { organizationId: orgId, deletedAt: null },
  });
  if (currentCount >= limits.webhooks) {
    throw new Error(
      `Webhook limit reached (${limits.webhooks}). Upgrade your plan for more.`,
    );
  }
}
