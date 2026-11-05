-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "extractMode" TEXT NOT NULL DEFAULT 'auto';

-- Webhooks that already use templates keep their current behavior.
UPDATE "Webhook" SET "extractMode" = 'template'
WHERE "titleTemplate" IS NOT NULL
   OR "messageTemplate" IS NOT NULL
   OR "tagsTemplate" IS NOT NULL
   OR "priorityTemplate" IS NOT NULL;
