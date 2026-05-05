-- Soft-delete support for Webhook.
--
-- Hard-deleting a webhook used to cascade through Message -> Delivery, wiping
-- the delivery history for every message ever routed through it. We now
-- tombstone the row instead so history, billing aggregates, and metrics stay
-- intact. All list/detail/edit/receiver paths filter out rows with a non-null
-- deletedAt.
--
-- The existing alphorn_webhook_invalidate trigger fires on UPDATE, so setting
-- deletedAt will flush the in-process webhook cache automatically -- the
-- public /n/:publicId receiver starts returning 404 on the next request.

ALTER TABLE "Webhook" ADD COLUMN "deletedAt" TIMESTAMP(3);
