import { prisma } from "@/lib/db";
import { getQueue, DELIVERY_QUEUE } from "@/lib/queue";
import { MAX_DELIVERY_AGE_MS, MAX_RETRIES } from "./deliver";
import { logger as rootLogger } from "@/lib/logger";

const logger = rootLogger.child({ component: "worker", task: "sweep" });

const SWEEP_INTERVAL_MS = 60_000;
const REENQUEUE_AFTER_MS = 120_000;  // re-enqueue undelivered deliveries after 2 min
const STALE_AFTER_MS = 300_000;      // mark as STALE after 5 min — shown as undelivered
const REENQUEUE_PACE_MS = 900_000;   // re-enqueue a given row at most once per 15 min
const PROCESSING_STUCK_MS = 600_000; // pg-boss job expiry is 300s (expireInSeconds in
                                     // ./index.ts) — 10 min is safely past any live job
const STUCK_FAILED_AFTER_MS = 600_000; // 10 min — safely past pg-boss's 30s-with-backoff
                                       // retry cadence, so live retries are not disturbed

const EXPIRED_ERROR = "Expired: undelivered after 24 hours";

/**
 * Periodically find deliveries stuck in the pipeline (never picked up, or
 * orphaned by a worker crash) and mark, re-enqueue, or expire them.
 */
export function startSweep() {
  const interval = setInterval(async () => {
    try {
      await markStaleDeliveries();
      await reenqueueOrphanedDeliveries();
      await recoverStuckProcessing();
      await recoverLostFailedDeliveries();
      await expireUndeliveredDeliveries();
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, "Sweep failed");
    }
  }, SWEEP_INTERVAL_MS);

  interval.unref();
  logger.info({ intervalMs: SWEEP_INTERVAL_MS }, "Orphan sweep started");
}

/**
 * Deliveries still PENDING with 0 attempts after 5 minutes are marked STALE so
 * they show up in the dashboard as undelivered. They stay claimable and get
 * re-enqueued until they are 24 hours old. This update also bumps updatedAt,
 * which merely delays the row's first paced re-enqueue — acceptable.
 */
async function markStaleDeliveries() {
  const staleThreshold = new Date(Date.now() - STALE_AFTER_MS);

  const { count } = await prisma.delivery.updateMany({
    where: {
      status: "PENDING",
      attempts: 0,
      createdAt: { lt: staleThreshold },
    },
    data: {
      status: "STALE",
      lastError: "Delivery was never picked up by a worker",
    },
  });

  if (count > 0) {
    logger.warn({ count, staleDurationMs: STALE_AFTER_MS }, "Marked stale deliveries");
  }
}

/**
 * Deliveries PENDING or STALE with 0 attempts, older than 2 minutes but within
 * the 24h retry window, get re-enqueued — the pg-boss insert failed at
 * creation, or the job was lost/expired during worker downtime. Paced: only
 * rows last touched over 15 minutes ago are picked, and the lastError note
 * below bumps updatedAt so the same row is not re-enqueued every sweep tick.
 */
async function reenqueueOrphanedDeliveries() {
  const reenqueueThreshold = new Date(Date.now() - REENQUEUE_AFTER_MS);
  const maxAgeThreshold = new Date(Date.now() - MAX_DELIVERY_AGE_MS);
  const paceThreshold = new Date(Date.now() - REENQUEUE_PACE_MS);

  const orphaned = await prisma.delivery.findMany({
    where: {
      status: { in: ["PENDING", "STALE"] },
      attempts: 0,
      createdAt: {
        lt: reenqueueThreshold,
        gte: maxAgeThreshold,
      },
      updatedAt: { lt: paceThreshold },
    },
    select: { id: true, message: { select: { webhook: { select: { publicId: true } } } } },
    take: 500,
  });

  if (orphaned.length === 0) return;

  const queue = await getQueue();
  // Reconstruct the loop-detection trace from this webhook's publicId (the
  // same trace a fresh direct ingest here would sign). Upstream
  // cross-instance hops from the original request header are not persisted, so
  // a re-enqueued orphan starts hop-counting from this webhook only. That is
  // acceptable for the rare orphan/stuck-recovery path.
  await queue.insert(
    DELIVERY_QUEUE,
    orphaned.map((d) => ({
      data: { deliveryId: d.id, trace: [d.message.webhook.publicId] },
    })),
  );

  await prisma.delivery.updateMany({
    where: { id: { in: orphaned.map((d) => d.id) } },
    data: { lastError: "Re-enqueued by sweep" },
  });

  logger.info({ count: orphaned.length }, "Re-enqueued orphaned deliveries");
}

/**
 * A worker crash mid-send leaves rows PROCESSING forever — the pg-boss retry
 * sees them as not claimable and gives up. After 10 minutes no live job can
 * still hold the row: mark it FAILED and re-enqueue it, unless it is past the
 * 24h retry window, in which case it stays FAILED without re-enqueue.
 */
async function recoverStuckProcessing() {
  const stuckThreshold = new Date(Date.now() - PROCESSING_STUCK_MS);
  const maxAgeThreshold = new Date(Date.now() - MAX_DELIVERY_AGE_MS);

  const stuck = await prisma.delivery.findMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: stuckThreshold },
    },
    select: {
      id: true,
      createdAt: true,
      message: { select: { webhook: { select: { publicId: true } } } },
    },
    take: 500,
  });

  if (stuck.length === 0) return;

  await prisma.delivery.updateMany({
    where: { id: { in: stuck.map((d) => d.id) }, status: "PROCESSING" },
    data: {
      status: "FAILED",
      lastError: "Worker crashed or job expired mid-delivery",
    },
  });

  const retryable = stuck.filter((d) => d.createdAt >= maxAgeThreshold);
  if (retryable.length > 0) {
    const queue = await getQueue();
    // Reconstruct the trace from this webhook's publicId (see R6 note above).
    await queue.insert(
      DELIVERY_QUEUE,
      retryable.map((d) => ({
        data: { deliveryId: d.id, trace: [d.message.webhook.publicId] },
      })),
    );
  }

  logger.warn({ count: stuck.length, reenqueued: retryable.length }, "Recovered stuck PROCESSING deliveries");
}

/**
 * FAILED rows still have retries left, but if the queue was purged or the
 * process crashed after writing FAILED but before pg-boss rescheduled the
 * retry, that job is gone and the row sits FAILED forever. Re-enqueue FAILED
 * rows with retries remaining that have been idle past the live-retry window
 * and are still within the 24h retry window. The idempotent claim in
 * ./deliver.ts makes a double-fire with a still-live retry harmless.
 * Time-based staleness is a proxy for "job lost": we do not query pg-boss
 * job state. Upgrade to querying the job table if false re-enqueues ever
 * matter.
 */
async function recoverLostFailedDeliveries() {
  const stuckThreshold = new Date(Date.now() - STUCK_FAILED_AFTER_MS);
  const maxAgeThreshold = new Date(Date.now() - MAX_DELIVERY_AGE_MS);

  const lost = await prisma.delivery.findMany({
    where: {
      status: "FAILED",
      attempts: { lt: MAX_RETRIES },
      updatedAt: { lt: stuckThreshold },
      createdAt: { gte: maxAgeThreshold },
    },
    select: { id: true, message: { select: { webhook: { select: { publicId: true } } } } },
    take: 500,
  });

  if (lost.length === 0) return;

  const queue = await getQueue();
  // Reconstruct the trace from this webhook's publicId (see R6 note above).
  await queue.insert(
    DELIVERY_QUEUE,
    lost.map((d) => ({
      data: { deliveryId: d.id, trace: [d.message.webhook.publicId] },
    })),
  );

  logger.warn({ count: lost.length }, "Re-enqueued lost FAILED deliveries");
}

/**
 * STALE deliveries with 0 attempts older than 24 hours are past the retry
 * window — record why, once (the lastError guard keeps this from rewriting
 * the same rows every tick). They stay STALE; the worker's claim in
 * ./deliver.ts never sends anything older than 24 hours.
 */
async function expireUndeliveredDeliveries() {
  const maxAgeThreshold = new Date(Date.now() - MAX_DELIVERY_AGE_MS);

  const { count } = await prisma.delivery.updateMany({
    where: {
      status: "STALE",
      attempts: 0,
      createdAt: { lt: maxAgeThreshold },
      lastError: { not: EXPIRED_ERROR },
    },
    data: { lastError: EXPIRED_ERROR },
  });

  if (count > 0) {
    logger.warn({ count }, "Expired undelivered deliveries");
  }
}
