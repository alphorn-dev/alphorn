import { prisma } from "@/lib/db";
import { isBillingEnabled } from "@/lib/billing/paddle";
import { getPlanLimits } from "@/lib/billing/plans";
import { limitsForSubscription } from "@/lib/billing/subscription";
import { logger } from "@/lib/logger";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DELETE_BATCH_SIZE = 1000;

/**
 * Delete the orgs' messages older than `cutoff` (deliveries cascade) in small
 * batches, so a first run or a plan downgrade never becomes one huge DELETE
 * holding locks for minutes. SKIP LOCKED lets every worker instance run the
 * sweep at once without blocking each other on the same rows.
 */
export async function deleteMessagesBefore(orgIds: string[], cutoff: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM "Message" WHERE "id" IN (
        SELECT m."id" FROM "Message" m
        JOIN "Webhook" w ON w."id" = m."webhookId"
        WHERE w."organizationId" = ANY(${orgIds}::text[]) AND m."createdAt" < ${cutoff}
        LIMIT ${DELETE_BATCH_SIZE}
        FOR UPDATE OF m SKIP LOCKED
      )
    `;
    total += deleted;
    if (deleted < DELETE_BATCH_SIZE) return total;
  }
}

export function startRetentionSweep() {
  if (!isBillingEnabled()) {
    logger.info({ component: "retention" }, "Retention sweep disabled (self-hosted)");
    return;
  }

  logger.info({ component: "retention" }, "Starting retention sweep");

  async function sweep() {
    try {
      // SaaS mode: sweep per-org based on plan retention
      const orgs = await prisma.organization.findMany({
        select: {
          id: true,
          subscription: {
            select: {
              plan: true,
              status: true,
              currentPeriodEnd: true,
              overrideMessageLimit: true,
              overrideWebhookLimit: true,
              overrideChannelLimit: true,
              overrideRetentionDays: true,
              purchasedPacks: true,
            },
          },
        },
      });

      // Group orgs by their effective retention window so each distinct
      // window gets a single batched delete, instead of one per org per sweep.
      const orgIdsByRetentionDays = new Map<number, string[]>();
      for (const org of orgs) {
        // Effective plan: a paused or lapsed subscription retains like free.
        const retentionDays = org.subscription
          ? limitsForSubscription(org.subscription).retentionDays
          : getPlanLimits("free").retentionDays;
        const orgIds = orgIdsByRetentionDays.get(retentionDays);
        if (orgIds) {
          orgIds.push(org.id);
        } else {
          orgIdsByRetentionDays.set(retentionDays, [org.id]);
        }
      }

      for (const [retentionDays, orgIds] of orgIdsByRetentionDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);

        const deleted = await deleteMessagesBefore(orgIds, cutoff);

        if (deleted > 0) {
          logger.info(
            {
              component: "retention",
              orgCount: orgIds.length,
              deleted,
              retentionDays,
            },
            "Swept old messages",
          );
        }
      }

      // Usage counters only matter for the current billing period (at most
      // ~31 days); keep two months for support lookups.
      const counterCutoff = new Date();
      counterCutoff.setDate(counterCutoff.getDate() - 62);
      await prisma.usageCounter.deleteMany({ where: { hour: { lt: counterCutoff } } });
    } catch (err) {
      logger.error({ component: "retention", err }, "Retention sweep failed");
    }
  }

  // Run immediately, then every hour
  sweep();
  setInterval(sweep, SWEEP_INTERVAL_MS);
}
