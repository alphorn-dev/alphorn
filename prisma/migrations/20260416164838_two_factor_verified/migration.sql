-- Better Auth 1.6 renamed TwoFactor.enabled -> TwoFactor.verified (default true).
-- Existing rows (if any) were created before setup could complete, so treat
-- them as unverified. New rows default to `true` unless setup flow writes false.
ALTER TABLE "TwoFactor" RENAME COLUMN "enabled" TO "verified";
ALTER TABLE "TwoFactor" ALTER COLUMN "verified" SET DEFAULT true;
