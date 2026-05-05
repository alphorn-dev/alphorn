-- Shared rate-limit state for Better Auth when running multiple instances.
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");
