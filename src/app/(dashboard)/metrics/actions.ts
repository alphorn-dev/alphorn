"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/server";

export interface DailyMessageCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface DailyDeliveryStats {
  date: string; // YYYY-MM-DD
  delivered: number;
  failed: number;
}

export interface ChannelStats {
  channelId: string;
  channelName: string;
  channelType: string;
  delivered: number;
  failed: number;
  total: number;
}

export interface WebhookStats {
  webhookId: string;
  webhookName: string;
  messageCount: number;
}

export interface ErrorStats {
  error: string;
  count: number;
}

export interface DailyLatency {
  date: string; // YYYY-MM-DD
  avgMs: number;
}

export interface MetricsData {
  totalMessages: number;
  totalDeliveries: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRate: number; // percentage
  dailyMessages: DailyMessageCount[];
  dailyDeliveries: DailyDeliveryStats[];
  avgLatencyMs: number | null;
  avgRetries: number | null;
  pendingCount: number;
  dailyLatency: DailyLatency[];
  topChannels: ChannelStats[];
  topWebhooks: WebhookStats[];
  topErrors: ErrorStats[];
}

export async function getMetrics(days: number = 30): Promise<MetricsData> {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return {
      totalMessages: 0,
      totalDeliveries: 0,
      deliveredCount: 0,
      failedCount: 0,
      deliveryRate: 0,
      dailyMessages: [],
      dailyDeliveries: [],
      avgLatencyMs: null,
      avgRetries: null,
      pendingCount: 0,
      dailyLatency: [],
      topChannels: [],
      topWebhooks: [],
      topErrors: [],
    };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [
    totalMessages,
    deliveryCountsRaw,
    dailyMessagesRaw,
    dailyDeliveriesRaw,
    avgLatencyRaw,
    avgRetriesRaw,
    dailyLatencyRaw,
    topChannelsRaw,
    topWebhooksRaw,
    topErrorsRaw,
  ] = await Promise.all([
    prisma.message.count({
      where: { webhook: { organizationId: orgId }, createdAt: { gte: since } },
    }),
    prisma.$queryRaw<
      {
        delivered: bigint;
        failed: bigint;
        pending: bigint;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'DELIVERED' AND "Delivery"."createdAt" >= ${since})::bigint AS delivered,
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'FAILED' AND "Delivery"."createdAt" >= ${since})::bigint AS failed,
        COUNT(*) FILTER (WHERE "Delivery"."status" IN ('PENDING', 'PROCESSING'))::bigint AS pending
      FROM "Delivery"
      JOIN "Channel" ON "Delivery"."channelId" = "Channel"."id"
      WHERE "Channel"."organizationId" = ${orgId}
        AND (
          "Delivery"."createdAt" >= ${since}
          OR "Delivery"."status" IN ('PENDING', 'PROCESSING')
        )
    `,
    prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT DATE("Message"."createdAt") as date, COUNT(*)::bigint as count
      FROM "Message"
      JOIN "Webhook" ON "Message"."webhookId" = "Webhook"."id"
      WHERE "Webhook"."organizationId" = ${orgId}
        AND "Message"."createdAt" >= ${since}
      GROUP BY DATE("Message"."createdAt")
      ORDER BY date ASC
    `,
    prisma.$queryRaw<{ date: Date; delivered: bigint; failed: bigint }[]>`
      SELECT
        DATE("Delivery"."createdAt") as date,
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'DELIVERED')::bigint as delivered,
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'FAILED')::bigint as failed
      FROM "Delivery"
      JOIN "Channel" ON "Delivery"."channelId" = "Channel"."id"
      WHERE "Channel"."organizationId" = ${orgId}
        AND "Delivery"."createdAt" >= ${since}
      GROUP BY DATE("Delivery"."createdAt")
      ORDER BY date ASC
    `,
    // Average delivery latency (only successful deliveries with deliveredAt)
    prisma.$queryRaw<{ avg_ms: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("Delivery"."deliveredAt" - "Message"."createdAt")) * 1000)::float as avg_ms
      FROM "Delivery"
      JOIN "Message" ON "Delivery"."messageId" = "Message"."id"
      JOIN "Channel" ON "Delivery"."channelId" = "Channel"."id"
      WHERE "Channel"."organizationId" = ${orgId}
        AND "Delivery"."status" = 'DELIVERED'
        AND "Delivery"."deliveredAt" IS NOT NULL
        AND "Message"."createdAt" >= ${since}
    `,
    // Average retry attempts (completed deliveries)
    prisma.$queryRaw<{ avg_attempts: number | null }[]>`
      SELECT AVG("Delivery"."attempts")::float as avg_attempts
      FROM "Delivery"
      JOIN "Channel" ON "Delivery"."channelId" = "Channel"."id"
      WHERE "Channel"."organizationId" = ${orgId}
        AND "Delivery"."status" IN ('DELIVERED', 'FAILED')
        AND "Delivery"."createdAt" >= ${since}
    `,
    // Daily average latency
    prisma.$queryRaw<{ date: Date; avg_ms: number }[]>`
      SELECT
        DATE("Delivery"."deliveredAt") as date,
        AVG(EXTRACT(EPOCH FROM ("Delivery"."deliveredAt" - "Message"."createdAt")) * 1000)::float as avg_ms
      FROM "Delivery"
      JOIN "Message" ON "Delivery"."messageId" = "Message"."id"
      JOIN "Channel" ON "Delivery"."channelId" = "Channel"."id"
      WHERE "Channel"."organizationId" = ${orgId}
        AND "Delivery"."status" = 'DELIVERED'
        AND "Delivery"."deliveredAt" IS NOT NULL
        AND "Message"."createdAt" >= ${since}
      GROUP BY DATE("Delivery"."deliveredAt")
      ORDER BY date ASC
    `,
    // Top channels by delivery volume
    prisma.$queryRaw<{ channel_id: string; channel_name: string; channel_type: string; delivered: bigint; failed: bigint; total: bigint }[]>`
      SELECT
        "Channel"."id" as channel_id,
        "Channel"."name" as channel_name,
        "Channel"."type" as channel_type,
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'DELIVERED')::bigint as delivered,
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'FAILED')::bigint as failed,
        COUNT(*)::bigint as total
      FROM "Delivery"
      JOIN "Channel" ON "Delivery"."channelId" = "Channel"."id"
      WHERE "Channel"."organizationId" = ${orgId}
        AND "Delivery"."createdAt" >= ${since}
      GROUP BY "Channel"."id", "Channel"."name", "Channel"."type"
      ORDER BY total DESC
      LIMIT 10
    `,
    // Top webhooks by message volume
    prisma.$queryRaw<{ webhook_id: string; webhook_name: string; message_count: bigint }[]>`
      SELECT
        "Webhook"."id" as webhook_id,
        "Webhook"."name" as webhook_name,
        COUNT(*)::bigint as message_count
      FROM "Message"
      JOIN "Webhook" ON "Message"."webhookId" = "Webhook"."id"
      WHERE "Webhook"."organizationId" = ${orgId}
        AND "Message"."createdAt" >= ${since}
      GROUP BY "Webhook"."id", "Webhook"."name"
      ORDER BY message_count DESC
      LIMIT 10
    `,
    // Top errors
    prisma.$queryRaw<{ error: string; count: bigint }[]>`
      SELECT
        "Delivery"."lastError" as error,
        COUNT(*)::bigint as count
      FROM "Delivery"
      JOIN "Channel" ON "Delivery"."channelId" = "Channel"."id"
      WHERE "Channel"."organizationId" = ${orgId}
        AND "Delivery"."status" = 'FAILED'
        AND "Delivery"."lastError" IS NOT NULL
        AND "Delivery"."createdAt" >= ${since}
      GROUP BY "Delivery"."lastError"
      ORDER BY count DESC
      LIMIT 10
    `,
  ]);

  const counts = deliveryCountsRaw[0];
  const deliveredCount = counts ? Number(counts.delivered) : 0;
  const failedCount = counts ? Number(counts.failed) : 0;
  const pendingCount = counts ? Number(counts.pending) : 0;

  const totalDeliveries = deliveredCount + failedCount + pendingCount;
  const deliveryRate =
    totalDeliveries > 0
      ? Math.round((deliveredCount / totalDeliveries) * 1000) / 10
      : 0;

  // Fill in missing dates with zeros for continuous chart lines
  const dailyMessages: DailyMessageCount[] = [];
  const dailyDeliveries: DailyDeliveryStats[] = [];

  const msgMap = new Map(
    dailyMessagesRaw.map((r) => [
      new Date(r.date).toISOString().slice(0, 10),
      Number(r.count),
    ])
  );
  const delMap = new Map(
    dailyDeliveriesRaw.map((r) => [
      new Date(r.date).toISOString().slice(0, 10),
      { delivered: Number(r.delivered), failed: Number(r.failed) },
    ])
  );

  for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    dailyMessages.push({ date: key, count: msgMap.get(key) ?? 0 });
    const del = delMap.get(key);
    dailyDeliveries.push({
      date: key,
      delivered: del?.delivered ?? 0,
      failed: del?.failed ?? 0,
    });
  }

  const avgLatencyMs = avgLatencyRaw[0]?.avg_ms
    ? Math.round(avgLatencyRaw[0].avg_ms)
    : null;
  const avgRetries = avgRetriesRaw[0]?.avg_attempts
    ? Math.round(avgRetriesRaw[0].avg_attempts * 10) / 10
    : null;

  const latencyMap = new Map(
    dailyLatencyRaw.map((r) => [
      new Date(r.date).toISOString().slice(0, 10),
      Math.round(r.avg_ms),
    ])
  );
  const dailyLatency: DailyLatency[] = [];
  for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const avgMs = latencyMap.get(key);
    if (avgMs !== undefined) {
      dailyLatency.push({ date: key, avgMs });
    }
  }

  const topChannels: ChannelStats[] = topChannelsRaw.map((r) => ({
    channelId: r.channel_id,
    channelName: r.channel_name,
    channelType: r.channel_type,
    delivered: Number(r.delivered),
    failed: Number(r.failed),
    total: Number(r.total),
  }));

  const topWebhooks: WebhookStats[] = topWebhooksRaw.map((r) => ({
    webhookId: r.webhook_id,
    webhookName: r.webhook_name,
    messageCount: Number(r.message_count),
  }));

  const topErrors: ErrorStats[] = topErrorsRaw.map((r) => ({
    error: r.error,
    count: Number(r.count),
  }));

  return {
    totalMessages,
    totalDeliveries,
    deliveredCount,
    failedCount,
    deliveryRate,
    dailyMessages,
    dailyDeliveries,
    avgLatencyMs,
    avgRetries,
    pendingCount,
    dailyLatency,
    topChannels,
    topWebhooks,
    topErrors,
  };
}
