-- DropIndex
DROP INDEX "Message_message_trgm_idx";

-- DropIndex
DROP INDEX "Message_title_trgm_idx";

-- AlterTable
ALTER TABLE "TwoFactor" ADD COLUMN     "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
