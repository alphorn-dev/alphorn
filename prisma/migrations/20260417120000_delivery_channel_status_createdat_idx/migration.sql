-- Composite index supporting per-org + per-status + time-window queries
-- used by the dashboard/metrics stats (filter Delivery by channel -> org,
-- then by status and createdAt). Replaces the single-column channelId index
-- since its leftmost prefix (channelId) covers the same lookups.
--
-- Uses CONCURRENTLY so it can be built without blocking writes to Delivery
-- on a large production table. Prisma 7 runs each DDL statement outside a
-- transaction, so CONCURRENTLY is safe here.

-- DropIndex
DROP INDEX IF EXISTS "Delivery_channelId_idx";

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Delivery_channelId_status_createdAt_idx"
  ON "Delivery"("channelId", "status", "createdAt");
