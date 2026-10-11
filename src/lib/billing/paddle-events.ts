import type { Prisma } from "@/generated/prisma/client";

/**
 * Claims a Paddle event for processing inside the caller's transaction.
 * Returns false when the event was already processed (a duplicate delivery).
 *
 * No statement here may fail: Postgres aborts the whole transaction on any
 * error, so catching a unique violation and continuing does not work. A row
 * left with processedAt = null by a failed attempt is re-claimed, so Paddle's
 * retry is actually applied. A concurrent delivery of the same event blocks
 * on the row lock and then sees processedAt set.
 */
export async function claimPaddleEvent(
  tx: Prisma.TransactionClient,
  id: string,
  type: string,
): Promise<boolean> {
  await tx.paddleEvent.createMany({ data: [{ id, type }], skipDuplicates: true });
  const claimed = await tx.paddleEvent.updateMany({
    where: { id, processedAt: null },
    data: { processedAt: new Date(), error: null },
  });
  return claimed.count === 1;
}
