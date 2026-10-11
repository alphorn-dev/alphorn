-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Message_title_trgm_idx" ON "Message" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Message_message_trgm_idx" ON "Message" USING GIN ("message" gin_trgm_ops);
