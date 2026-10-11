import { randomBytes } from "crypto";
import { prisma } from "./db";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

// One atomic upsert so the cap holds under concurrent workers. Semantics:
// the window restarts when the last accepted request is older than windowMs;
// a rejected request never bumps lastRequest, so hammering cannot extend the
// window. `count` may exceed `limit` (rejections still increment it) — only
// `count <= limit` means accepted.
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = BigInt(Date.now());
  const cutoff = now - BigInt(windowMs);
  const id = randomBytes(12).toString("hex");

  const [row] = await prisma.$queryRaw<Array<{ count: number; lastRequest: bigint }>>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${id}, ${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."lastRequest" < ${cutoff} THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "lastRequest" = CASE
        WHEN "RateLimit"."lastRequest" < ${cutoff} OR "RateLimit"."count" < ${limit} THEN ${now}
        ELSE "RateLimit"."lastRequest"
      END
    RETURNING "count", "lastRequest"
  `;

  if (row.count > limit) {
    throw new RateLimitError(windowMs - Number(now - row.lastRequest));
  }
}
