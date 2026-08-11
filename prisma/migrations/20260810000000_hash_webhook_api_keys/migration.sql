-- Replace the plaintext Webhook.apiKey with a SHA-256 hash + a short display
-- prefix, backfilling existing rows so no webhook loses its credential.

-- AlterTable: add new columns nullable so we can backfill before enforcing.
ALTER TABLE "Webhook" ADD COLUMN "apiKeyHash" TEXT;
ALTER TABLE "Webhook" ADD COLUMN "apiKeyPrefix" TEXT;

-- Backfill from the existing plaintext key (sha256() is built-in on Postgres >= 11).
UPDATE "Webhook"
SET "apiKeyHash" = encode(sha256(convert_to("apiKey", 'UTF8')), 'hex'),
    "apiKeyPrefix" = left("apiKey", 12);

-- Enforce NOT NULL now that every row is backfilled.
ALTER TABLE "Webhook" ALTER COLUMN "apiKeyHash" SET NOT NULL;
ALTER TABLE "Webhook" ALTER COLUMN "apiKeyPrefix" SET NOT NULL;

-- Unique index on the hash (replaces the old unique on apiKey).
CREATE UNIQUE INDEX "Webhook_apiKeyHash_key" ON "Webhook"("apiKeyHash");

-- Drop the plaintext column (its unique index goes with it).
ALTER TABLE "Webhook" DROP COLUMN "apiKey";
