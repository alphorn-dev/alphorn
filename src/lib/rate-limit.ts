import { randomBytes } from "crypto";
import { prisma } from "./db";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = Date.now();
  const cutoff = now - windowMs;
  const existing = await prisma.rateLimit.findUnique({ where: { key } });

  if (existing && Number(existing.lastRequest) >= cutoff) {
    if (existing.count >= limit) {
      throw new RateLimitError(windowMs - (now - Number(existing.lastRequest)));
    }
    await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 }, lastRequest: BigInt(now) },
    });
    return;
  }

  await prisma.rateLimit.upsert({
    where: { key },
    create: { id: randomBytes(12).toString("hex"), key, count: 1, lastRequest: BigInt(now) },
    update: { count: 1, lastRequest: BigInt(now) },
  });
}
