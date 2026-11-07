-- CreateTable
CREATE TABLE "UsageCounter" (
    "organizationId" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("organizationId","hour")
);

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from messages still on disk so current-period usage survives the
-- switch. 32 days covers the longest billing period; older messages can't
-- affect any quota anymore.
INSERT INTO "UsageCounter" ("organizationId", "hour", "count")
SELECT w."organizationId", date_trunc('hour', m."createdAt"), count(*)::int
FROM "Message" m
JOIN "Webhook" w ON w."id" = m."webhookId"
WHERE m."createdAt" >= now() - interval '32 days'
GROUP BY 1, 2;
