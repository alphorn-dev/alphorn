import { prisma } from "@/lib/db";
import { isBillingEnabled } from "@/lib/billing/paddle";
import { getPlanLimits } from "@/lib/billing/plans";
import { logger } from "@/lib/logger";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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
              overrideRetentionDays: true,
            },
          },
        },
      });

      // Group orgs by their effective retention window so each distinct
      // window gets a single deleteMany, instead of one per org per sweep.
      const orgIdsByRetentionDays = new Map<number, string[]>();
      for (const org of orgs) {
        const retentionDays =
          org.subscription?.overrideRetentionDays ??
          getPlanLimits(org.subscription?.plan ?? "free").retentionDays;
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

        const deleted = await prisma.message.deleteMany({
          where: {
            webhook: { organizationId: { in: orgIds } },
            createdAt: { lt: cutoff },
          },
        });

        if (deleted.count > 0) {
          logger.info(
            {
              component: "retention",
              orgCount: orgIds.length,
              deleted: deleted.count,
              retentionDays,
            },
            "Swept old messages",
          );
        }
      }
    } catch (err) {
      logger.error(
        {
          component: "retention",
          error: err instanceof Error ? err.message : "Unknown",
        },
        "Retention sweep failed",
      );
    }
  }

  // Run immediately, then every hour
  sweep();
  setInterval(sweep, SWEEP_INTERVAL_MS);
}
