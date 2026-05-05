import { prisma } from "./db";
import { getQueue, DELIVERY_QUEUE } from "./queue";

export interface PersistMessageInput {
  webhookId: string;
  title: string | null;
  message: string;
  priority: number | null;
  tags: string[];
  payload: Record<string, unknown> | null;
  channelIds: string[];
  trace?: string[];
}

export async function persistMessageAndEnqueueDeliveries(
  input: PersistMessageInput,
): Promise<{ messageId: string }> {
  const { webhookId, title, message, priority, tags, payload, channelIds, trace } =
    input;

  // Warm the queue client while we write so its start-up overlaps with the DB.
  const queuePromise = channelIds.length > 0 ? getQueue() : null;

  const payloadJson = JSON.stringify(payload ?? {});

  // One round-trip: insert the Message and all Deliveries via a CTE, and
  // return both the message id and the freshly-minted delivery ids. This
  // replaces an interactive $transaction (BEGIN + 2 inserts + COMMIT = 4 RT)
  // plus a follow-up findMany readback.
  const rows = await prisma.$queryRaw<
    Array<{ messageId: string; deliveryIds: string[] }>
  >`
    WITH m AS (
      INSERT INTO "Message"
        ("webhookId", "title", "message", "priority", "tags", "payload")
      VALUES
        (${webhookId}, ${title}, ${message}, ${priority}::int,
         ${tags}::text[], ${payloadJson}::jsonb)
      RETURNING "id"
    ),
    d AS (
      INSERT INTO "Delivery" ("messageId", "channelId", "updatedAt")
      SELECT m."id", c.channel_id, now()
      FROM m CROSS JOIN unnest(${channelIds}::text[]) AS c(channel_id)
      RETURNING "id"
    )
    SELECT
      m."id"::text AS "messageId",
      COALESCE(
        (SELECT array_agg(d."id"::text) FROM d),
        ARRAY[]::text[]
      ) AS "deliveryIds"
    FROM m
  `;

  const { messageId, deliveryIds } = rows[0];

  if (queuePromise && deliveryIds.length > 0) {
    const queue = await queuePromise;
    await queue.insert(
      DELIVERY_QUEUE,
      deliveryIds.map((id) => ({
        data: {
          deliveryId: id,
          ...(trace !== undefined ? { trace } : {}),
        },
      })),
    );
  }

  return { messageId };
}
