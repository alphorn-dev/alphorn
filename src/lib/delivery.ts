import { prisma } from "./db";
import { getQueue, DELIVERY_QUEUE } from "./queue";

export interface PersistMessageInput {
  webhookId: string;
  title: string | null;
  message: string;
  priority: number | null;
  tags: string[];
  payload: Record<string, unknown> | null;
  // Pre-serialized payload (e.g. the receiver's raw request body) to skip a
  // redundant re-stringify on the hot path. Must be JSON equal to `payload`.
  payloadJson?: string;
  /** Request headers for the Forward channel, already filtered by pickForwardHeaders. */
  headers?: Record<string, string>;
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

  const payloadJson = input.payloadJson ?? JSON.stringify(payload ?? {});
  const headersJson = input.headers ? JSON.stringify(input.headers) : null;

  // One round-trip: insert the Message and all Deliveries via a CTE, and
  // return both the message id and the freshly-minted delivery ids. This
  // replaces an interactive $transaction (BEGIN + 2 inserts + COMMIT = 4 RT)
  // plus a follow-up findMany readback.
  const rows = await prisma.$queryRaw<
    Array<{ messageId: string; deliveryIds: string[] }>
  >`
    WITH m AS (
      INSERT INTO "Message"
        ("webhookId", "title", "message", "priority", "tags", "payload", "headers")
      VALUES
        (${webhookId}, ${title}, ${message}, ${priority}::int,
         ${tags}::text[], ${payloadJson}::jsonb, ${headersJson}::jsonb)
      RETURNING "id"
    ),
    d AS (
      INSERT INTO "Delivery" ("messageId", "channelId", "updatedAt")
      SELECT m."id", c.channel_id, now()
      FROM m CROSS JOIN unnest(${channelIds}::text[]) AS c(channel_id)
      RETURNING "id"    ),
    -- Quota usage counter (see UsageCounter in schema.prisma). Unreferenced
    -- data-modifying CTEs still run, in the same statement as the insert.
    u AS (
      INSERT INTO "UsageCounter" ("organizationId", "hour", "count")
      SELECT w."organizationId", date_trunc('hour', now() AT TIME ZONE 'UTC'), 1
      FROM m JOIN "Webhook" w ON w."id" = ${webhookId}
      ON CONFLICT ("organizationId", "hour")
        DO UPDATE SET "count" = "UsageCounter"."count" + 1
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
