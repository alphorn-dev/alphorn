import { afterAll, beforeAll, beforeEach } from "vitest";

// Real channel handlers register themselves as a side-effect on import, so
// pull them in before the test handler so getChannel() resolves both.
import "@/channels";
import "../helpers/test-channel";

import { prisma } from "@/lib/db";
import { getQueue, DELIVERY_QUEUE } from "@/lib/queue";
import { resetTestChannel } from "../helpers/test-channel";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl) {
  throw new Error("DATABASE_URL must be set for integration tests");
}
if (!/(test|integration)/i.test(dbUrl)) {
  throw new Error(
    `Refusing to run integration tests against ${dbUrl} — database name must contain "test" or "integration". ` +
      `Point DATABASE_URL at a dedicated test database.`,
  );
}

beforeAll(async () => {
  // Warm pg-boss so its schema and queue tables exist before truncation runs.
  const boss = await getQueue();
  await boss.createQueue(DELIVERY_QUEUE).catch(() => {
    // createQueue throws if the queue already exists; that's fine.
  });
});

beforeEach(async () => {
  resetTestChannel();

  // Cascade from the aggregate roots wipes every org-scoped row (webhooks,
  // channels, deliveries, messages, subscriptions, settings, members,
  // invitations, invite links) and every user-scoped row (sessions,
  // accounts, two-factor records).
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Organization", "User", "Verification", "RateLimit", "PaddleEvent", "SubscriptionEvent" RESTART IDENTITY CASCADE',
  );

  const boss = await getQueue();
  await boss.deleteAllJobs(DELIVERY_QUEUE);
});

afterAll(async () => {
  const boss = await getQueue();
  await boss.stop({ graceful: false });
  await prisma.$disconnect();
});
