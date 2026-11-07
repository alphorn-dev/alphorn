import { PgBoss } from "pg-boss";
import { logger } from "@/lib/logger";

const globalForPgBoss = globalThis as unknown as {
  pgBoss: PgBoss | undefined;
  pgBossStarted: boolean;
};

function createBoss(): PgBoss {
  if (!globalForPgBoss.pgBoss) {
    globalForPgBoss.pgBoss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      // LISTEN/NOTIFY wakes workers on new jobs instead of polling every ~2s,
      // giving sub-second pickup with near-zero idle DB load. Requires the
      // delivery queue's notify:true (see src/worker/index.ts). Holds one
      // dedicated LISTEN connection - incompatible with PgBouncer transaction
      // pooling; self-hosters behind such a pooler get polling regardless.
      useListenNotify: true,
    });
    // Without a listener, pg-boss's error event throws out of the worker loop
    // and deliveries stop silently on the first DB blip.
    globalForPgBoss.pgBoss.on("error", (err) => {
      logger.error({ err, component: "queue" }, "pg-boss error");
    });
  }
  return globalForPgBoss.pgBoss;
}

/**
 * Get the pgboss instance, ensuring it's started.
 * Safe to call multiple times - only starts once.
 */
export async function getQueue(): Promise<PgBoss> {
  const boss = createBoss();
  if (!globalForPgBoss.pgBossStarted) {
    await boss.start();
    globalForPgBoss.pgBossStarted = true;
  }
  return boss;
}

/**
 * Stop pg-boss, letting in-flight jobs finish first. Docker sends SIGKILL 10s
 * after SIGTERM, so the timeout stays below that.
 */
export async function stopQueue(): Promise<void> {
  if (!globalForPgBoss.pgBoss || !globalForPgBoss.pgBossStarted) return;
  await globalForPgBoss.pgBoss.stop({ graceful: true, timeout: 8000 });
  globalForPgBoss.pgBossStarted = false;
}

export const DELIVERY_QUEUE = "delivery";
