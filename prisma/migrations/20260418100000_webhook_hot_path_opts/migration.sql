-- Optimizations for the /n/:publicId webhook hot path:
--   1. Auto-create a Subscription row whenever an Organization is created, so
--      the hot path can do a plain findUnique instead of an upsert.
--   2. NOTIFY the application process when any row that affects the cached
--      webhook-receiver read path changes (Webhook, WebhookChannel, Channel,
--      Subscription), so an in-process cache can invalidate instantly.

-- ---------------------------------------------------------------------------
-- 1. Subscription auto-create on Organization insert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION alphorn_create_subscription_for_org()
RETURNS trigger AS $$
BEGIN
  INSERT INTO "Subscription" ("id", "organizationId", "plan", "status", "purchasedPacks", "createdAt", "updatedAt")
  VALUES (
    -- cuid()-shaped random id; the app never reads this column, but the
    -- model declares @default(cuid()), so any unique string works.
    'sub_' || replace(gen_random_uuid()::text, '-', ''),
    NEW."id",
    'free',
    'active',
    0,
    now(),
    now()
  )
  ON CONFLICT ("organizationId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alphorn_organization_create_subscription ON "Organization";
CREATE TRIGGER alphorn_organization_create_subscription
AFTER INSERT ON "Organization"
FOR EACH ROW
EXECUTE FUNCTION alphorn_create_subscription_for_org();

-- Backfill any existing organizations that somehow lack a Subscription row.
INSERT INTO "Subscription" ("id", "organizationId", "plan", "status", "purchasedPacks", "createdAt", "updatedAt")
SELECT
  'sub_' || replace(gen_random_uuid()::text, '-', ''),
  o."id",
  'free',
  'active',
  0,
  now(),
  now()
FROM "Organization" o
LEFT JOIN "Subscription" s ON s."organizationId" = o."id"
WHERE s."id" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Cache-invalidation NOTIFY triggers
-- ---------------------------------------------------------------------------
--
-- The in-process webhook cache keys on publicId. When a row changes that
-- could affect any cached entry, the app flushes its cache. We send a tiny
-- payload (<table>:<key>) so consumers can pick targeted invalidation later
-- without another migration.

CREATE OR REPLACE FUNCTION alphorn_notify_cache_invalidate()
RETURNS trigger AS $$
DECLARE
  payload text;
BEGIN
  IF TG_TABLE_NAME = 'Webhook' THEN
    payload := 'Webhook:' || COALESCE(NEW."publicId", OLD."publicId");
  ELSIF TG_TABLE_NAME = 'WebhookChannel' THEN
    payload := 'WebhookChannel:' || COALESCE(NEW."webhookId", OLD."webhookId");
  ELSIF TG_TABLE_NAME = 'Channel' THEN
    payload := 'Channel:' || COALESCE(NEW."id", OLD."id");
  ELSIF TG_TABLE_NAME = 'Subscription' THEN
    payload := 'Subscription:' || COALESCE(NEW."organizationId", OLD."organizationId");
  ELSE
    payload := TG_TABLE_NAME;
  END IF;
  PERFORM pg_notify('alphorn_cache_invalidate', payload);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alphorn_webhook_invalidate ON "Webhook";
CREATE TRIGGER alphorn_webhook_invalidate
AFTER INSERT OR UPDATE OR DELETE ON "Webhook"
FOR EACH ROW
EXECUTE FUNCTION alphorn_notify_cache_invalidate();

DROP TRIGGER IF EXISTS alphorn_webhook_channel_invalidate ON "WebhookChannel";
CREATE TRIGGER alphorn_webhook_channel_invalidate
AFTER INSERT OR UPDATE OR DELETE ON "WebhookChannel"
FOR EACH ROW
EXECUTE FUNCTION alphorn_notify_cache_invalidate();

DROP TRIGGER IF EXISTS alphorn_channel_invalidate ON "Channel";
CREATE TRIGGER alphorn_channel_invalidate
AFTER INSERT OR UPDATE OR DELETE ON "Channel"
FOR EACH ROW
EXECUTE FUNCTION alphorn_notify_cache_invalidate();

DROP TRIGGER IF EXISTS alphorn_subscription_invalidate ON "Subscription";
CREATE TRIGGER alphorn_subscription_invalidate
AFTER INSERT OR UPDATE OR DELETE ON "Subscription"
FOR EACH ROW
EXECUTE FUNCTION alphorn_notify_cache_invalidate();
