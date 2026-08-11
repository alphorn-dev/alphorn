import { PgBoss } from "pg-boss";

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
      // dedicated LISTEN connection — incompatible with PgBouncer transaction
      // pooling; self-hosters behind such a pooler get polling regardless.
      useListenNotify: true,
    });
  }
  return globalForPgBoss.pgBoss;
}

/**
 * Get the pgboss instance, ensuring it's started.
 * Safe to call multiple times — only starts once.
 */
export async function getQueue(): Promise<PgBoss> {
  const boss = createBoss();
  if (!globalForPgBoss.pgBossStarted) {
    await boss.start();
    globalForPgBoss.pgBossStarted = true;
  }
  return boss;
}

export const DELIVERY_QUEUE = "delivery";
