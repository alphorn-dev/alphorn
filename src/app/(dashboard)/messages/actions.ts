"use server";

import { prisma } from "@/lib/db";
import { DeliveryStatus } from "@/generated/prisma/client";
import { requireSession, requireOrgSession, requireAdminOrOwner } from "@/lib/auth/server";
import { getQueue, DELIVERY_QUEUE } from "@/lib/queue";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { evaluateFilter } from "@/lib/filter";
import type { FilterDefinition } from "@/lib/filter/schema";
import { persistMessageAndEnqueueDeliveries } from "@/lib/delivery";
import {
  checkMessageQuotaForSubscription,
  getOrCreateSubscription,
} from "@/lib/billing/subscription";

export interface MessageFilters {
  q?: string;
  tag?: string;
  status?: string;
  priority?: string;
  webhook?: string;
  from?: string;
  to?: string;
  page?: string;
}

const PAGE_SIZE = 25;

export async function getMessagesForOrg(filters: MessageFilters = {}) {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return { messages: [], total: 0, page: 1, pageSize: PAGE_SIZE };

  // Capped so a crafted ?page= cannot force a huge OFFSET scan.
  const page = Math.min(10_000, Math.max(1, parseInt(filters.page ?? "1", 10) || 1));

  const where: Prisma.MessageWhereInput = {
    webhook: { organizationId: orgId },
  };

  if (filters.tag) {
    const tags = filters.tag.split(",");
    where.AND = tags.map((t) => ({ tags: { has: t } }));
  }

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { message: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.priority) {
    const priorities = filters.priority.split(",").map(Number).filter(Boolean);
    if (priorities.length === 1) {
      where.priority = priorities[0];
    } else if (priorities.length > 1) {
      where.priority = { in: priorities };
    }
  }

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to + "T23:59:59.999Z") } : {}),
    };
  }

  if (filters.webhook) {
    const webhookIds = filters.webhook.split(",");
    if (webhookIds.length === 1) {
      where.webhookId = webhookIds[0];
    } else {
      where.webhookId = { in: webhookIds };
    }
  }

  if (filters.status) {
    const statuses = filters.status.split(",");
    where.deliveries = { some: { status: { in: statuses as DeliveryStatus[] } } };
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      // Only the columns the messages table renders — omit the payload JSONB
      // (up to the 1MB webhook body limit) and other unused Delivery fields.
      select: {
        id: true,
        title: true,
        message: true,
        priority: true,
        tags: true,
        createdAt: true,
        webhook: { select: { name: true } },
        deliveries: {
          select: {
            id: true,
            status: true,
            channel: { select: { id: true, name: true, type: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.message.count({ where }),
  ]);

  return { messages, total, page, pageSize: PAGE_SIZE };
}

// The tag filter only needs recently-seen tags, so bound the DISTINCT unnest to
// this window instead of scanning the org's entire Message history (no index
// helps this aggregate; the time bound is what keeps it cheap).
const TAG_WINDOW_DAYS = 30;

export async function getAllTagsForOrg(): Promise<string[]> {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return [];

  const since = new Date(Date.now() - TAG_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest("Message"."tags") AS tag
    FROM "Message"
    JOIN "Webhook" ON "Message"."webhookId" = "Webhook"."id"
    WHERE "Webhook"."organizationId" = ${orgId}
      AND "Message"."createdAt" >= ${since}
    ORDER BY tag ASC
  `;

  return rows.map((r) => r.tag);
}

export async function getMessageById(id: string) {
  const { orgId } = await requireOrgSession();

  return prisma.message.findFirst({
    where: {
      id,
      webhook: { organizationId: orgId },
    },
    include: {
      webhook: { select: { name: true } },
      deliveries: {
        include: { channel: { select: { id: true, name: true, type: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function resendDelivery(deliveryId: string) {
  const { orgId } = await requireAdminOrOwner();

  const delivery = await prisma.delivery.findFirst({
    where: {
      id: deliveryId,
      channel: { organizationId: orgId },
    },
  });

  if (!delivery) throw new Error("Delivery not found");
  if (delivery.status === "PENDING" || delivery.status === "PROCESSING") {
    throw new Error("Delivery is already in progress");
  }

  await prisma.delivery.update({
    where: { id: deliveryId },
    data: { status: "PENDING", lastError: null },
  });

  const queue = await getQueue();
  await queue.send(DELIVERY_QUEUE, { deliveryId });
}

export async function getMessageDeliveries(messageId: string) {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;

  return prisma.delivery.findMany({
    where: {
      messageId,
      channel: { organizationId: orgId },
    },
    include: { channel: { select: { id: true, name: true, type: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWebhooksForSend() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return [];

  return prisma.webhook.findMany({
    where: { organizationId: orgId, enabled: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function sendTestMessage(
  webhookId: string,
  title: string,
  messageText: string,
  priority?: number | null,
  tags?: string[],
) {
  const { orgId } = await requireAdminOrOwner();

  const webhook = await prisma.webhook.findFirst({
    where: { id: webhookId, organizationId: orgId, enabled: true, deletedAt: null },
    include: { channels: { include: { channel: true } } },
  });
  if (!webhook) throw new Error("Webhook not found");

  // A UI test message is a real message: it is stored and delivered, so it
  // counts against the quota like one received on the webhook.
  const quota = await checkMessageQuotaForSubscription(orgId, await getOrCreateSubscription(orgId));
  if (!quota.allowed) throw new Error("Message quota exceeded for this billing period");

  const normalizedTags = tags?.filter(Boolean) ?? [];
  const payload = { title, message: messageText, _source: "ui" };
  const filterMessage = {
    title,
    message: messageText,
    priority: priority ?? null,
    tags: normalizedTags,
    payload,
  };
  // Same eligibility as the receiver (src/app/n/[publicId]/route.ts),
  // including the per-webhook mute on the link.
  const enabledChannels = webhook.channels.filter(
    (wc) =>
      wc.enabled &&
      wc.channel.enabled &&
      evaluateFilter(filterMessage, wc.filter as FilterDefinition | null),
  );
  if (enabledChannels.length === 0) {
    throw new Error("No enabled channels matched for this webhook");
  }

  const { messageId } = await persistMessageAndEnqueueDeliveries({
    webhookId: webhook.id,
    title,
    message: messageText,
    priority: priority ?? null,
    tags: normalizedTags,
    payload,
    channelIds: enabledChannels.map((wc) => wc.channelId),
  });

  revalidatePath("/messages");
  return messageId;
}

export async function getDashboardStats() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return {
      totalMessages: 0,
      totalDeliveries: 0,
      deliveredCount: 0,
      failedCount: 0,
      staleCount: 0,
      pendingCount: 0,
      recentMessages: [],
    };
  }

  const [totalMessages, deliveryCountsRaw, recentMessages] = await Promise.all([
    prisma.message.count({
      where: { webhook: { organizationId: orgId } },
    }),
    prisma.$queryRaw<
      {
        delivered: bigint;
        failed: bigint;
        stale: bigint;
        pending: bigint;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'DELIVERED')::bigint AS delivered,
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'FAILED')::bigint AS failed,
        COUNT(*) FILTER (WHERE "Delivery"."status" = 'STALE')::bigint AS stale,
        COUNT(*) FILTER (WHERE "Delivery"."status" IN ('PENDING', 'PROCESSING'))::bigint AS pending
      FROM "Delivery"
      JOIN "Channel" ON "Delivery"."channelId" = "Channel"."id"
      WHERE "Channel"."organizationId" = ${orgId}
    `,
    prisma.message.findMany({
      where: { webhook: { organizationId: orgId } },
      // Recent-messages card only shows title/webhook/status/time — omit the
      // payload JSONB and unused Delivery fields.
      select: {
        id: true,
        title: true,
        createdAt: true,
        webhook: { select: { name: true } },
        deliveries: {
          select: {
            id: true,
            status: true,
            channel: { select: { id: true, name: true, type: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const counts = deliveryCountsRaw[0];
  const deliveredCount = counts ? Number(counts.delivered) : 0;
  const failedCount = counts ? Number(counts.failed) : 0;
  const staleCount = counts ? Number(counts.stale) : 0;
  const pendingCount = counts ? Number(counts.pending) : 0;

  return {
    totalMessages,
    totalDeliveries: deliveredCount + failedCount + staleCount + pendingCount,
    deliveredCount,
    failedCount,
    staleCount,
    pendingCount,
    recentMessages,
  };
}
