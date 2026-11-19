"use server";

import { prisma } from "@/lib/db";
import { requireSession, requireOrgSession, requireAdminOrOwner } from "@/lib/auth/server";
import { getOrgLimits } from "@/lib/billing/subscription";
import { getChannel } from "@/channels";
import { generateChannelId, generatePublicId } from "@/lib/api-key";
import { revalidatePath } from "next/cache";
import { resourceNameSchema } from "@/lib/schemas";
import type { Prisma } from "@/generated/prisma/client";
import { decryptJson, encryptJson } from "@/lib/crypto/secrets";

export async function getChannelsForOrg() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return [];

  // Never return config to members - it holds channel credentials (bot tokens,
  // SMTP passwords, API keys) and this list is shipped to the browser. The
  // config-bearing read (getChannelById) is admin-gated below.
  return prisma.channel.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      enabled: true,
      createdAt: true,
      webhooks: {
        where: { webhook: { deletedAt: null } },
        select: { webhook: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

const CHANNEL_STATS_DAYS = 30;

/** Delivery counts and the most recent failure for a channel, last CHANNEL_STATS_DAYS. */
export async function getChannelDeliveryStats(channelId: string) {
  const { orgId } = await requireOrgSession();
  const since = new Date(Date.now() - CHANNEL_STATS_DAYS * 24 * 60 * 60 * 1000);
  const where = { channelId, channel: { organizationId: orgId }, createdAt: { gte: since } };

  const [groups, lastFailure] = await Promise.all([
    prisma.delivery.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.delivery.findFirst({
      where: { ...where, status: { in: ["FAILED", "STALE"] } },
      select: { lastError: true, updatedAt: true, messageId: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const count = (...statuses: string[]) =>
    groups.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  const delivered = count("DELIVERED");
  const failed = count("FAILED", "STALE");
  const finished = delivered + failed;
  return {
    days: CHANNEL_STATS_DAYS,
    delivered,
    failed,
    pending: count("PENDING", "PROCESSING"),
    // Rate over finished deliveries only; in-flight ones have no outcome yet.
    successRate: finished > 0 ? Math.round((delivered / finished) * 1000) / 10 : null,
    lastFailure,
  };
}

/** Read-only channel summary for any member: no config (credentials). */
export async function getChannelSummary(id: string) {
  const { orgId } = await requireOrgSession();

  return prisma.channel.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      enabled: true,
      createdAt: true,
      webhooks: {
        where: { webhook: { deletedAt: null } },
        select: { enabled: true, filter: true, webhook: { select: { id: true, name: true, enabled: true } } },
      },
    },
  });
}

export async function getChannelById(id: string) {
  // Returns the full row including config (credentials) - admin/owner only.
  const { orgId } = await requireAdminOrOwner();

  const channel = await prisma.channel.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  return channel && { ...channel, config: decryptJson(channel.config) };
}

export async function createChannel(data: {
  name: string;
  type: string;
  config: Record<string, unknown>;
}) {
  const { orgId } = await requireAdminOrOwner();

  const limits = await getOrgLimits(orgId);
  if (limits?.channels !== null && limits?.channels !== undefined) {
    const currentCount = await prisma.channel.count({
      where: { organizationId: orgId, deletedAt: null },
    });
    if (currentCount >= limits.channels) {
      throw new Error(
        `Channel limit reached (${limits.channels}). Upgrade your plan for more.`,
      );
    }
  }

  const handler = getChannel(data.type);
  if (!handler) throw new Error(`Unknown channel type: ${data.type}`);

  // Persist the parsed config so Zod defaults/coercions (port numbers, default
  // server URLs, HTTP method) are stored, not the raw form strings.
  const config = handler.configSchema.parse(data.config);

  const channel = await prisma.channel.create({
    data: {
      id: generateChannelId(),
      name: resourceNameSchema.parse(data.name),
      type: data.type,
      config: encryptJson(config) as Prisma.InputJsonValue,
      organizationId: orgId,
      publicId: crypto.randomUUID(),
    },
  });

  revalidatePath("/channels");
  return channel;
}

export async function updateChannel(
  id: string,
  data: {
    name: string;
    config: Record<string, unknown>;
    enabled: boolean;
  }
) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.channel.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Channel not found");

  // Re-enabling must respect the plan limit enforcePlanLimits applies on
  // downgrade (counted over enabled rows, unlike creation).
  if (data.enabled && !existing.enabled) {
    const limits = await getOrgLimits(orgId);
    if (limits?.channels !== null && limits?.channels !== undefined) {
      const enabledCount = await prisma.channel.count({
        where: { organizationId: orgId, enabled: true, deletedAt: null },
      });
      if (enabledCount >= limits.channels) {
        throw new Error(
          `Channel limit reached (${limits.channels} enabled). Upgrade your plan or disable another channel.`,
        );
      }
    }
  }

  const handler = getChannel(existing.type);
  if (!handler) throw new Error(`Unknown channel type: ${existing.type}`);
  const config = handler.configSchema.parse(data.config);

  const channel = await prisma.channel.update({
    where: { id },
    data: {
      name: resourceNameSchema.parse(data.name),
      config: encryptJson(config) as Prisma.InputJsonValue,
      enabled: data.enabled,
    },
  });

  revalidatePath("/channels");
  return channel;
}

export async function deleteChannel(id: string) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.channel.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Channel not found");

  // Soft delete: a hard delete cascades through Delivery and wipes history
  // (same reasoning as the Webhook soft delete). Drop the webhook links so the
  // channel disappears from routing and the webhook cache immediately.
  await prisma.$transaction([
    prisma.webhookChannel.deleteMany({ where: { channelId: id } }),
    prisma.channel.update({
      where: { id },
      data: { deletedAt: new Date(), enabled: false },
    }),
  ]);
  revalidatePath("/channels");
  revalidatePath("/webhooks");
}

export async function testChannelConfig(data: {
  type: string;
  config: Record<string, unknown>;
}) {
  await requireAdminOrOwner();

  const handler = getChannel(data.type);
  if (!handler) throw new Error(`Unknown channel type: ${data.type}`);
  if (!handler.test) throw new Error("This channel does not support testing");

  const parsed = handler.configSchema.parse(data.config);
  await handler.test(parsed);
}

export async function testChannel(id: string) {
  const { orgId } = await requireAdminOrOwner();

  const channel = await prisma.channel.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!channel) throw new Error("Channel not found");

  const handler = getChannel(channel.type);
  if (!handler) throw new Error(`Unknown channel type: ${channel.type}`);
  if (!handler.test) throw new Error("This channel does not support testing");

  await handler.test(handler.configSchema.parse(decryptJson(channel.config)));
}

export async function getSseConnectionCount(channelId: string): Promise<number> {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return 0;

  const channel = await prisma.channel.findFirst({
    where: { id: channelId, organizationId: orgId, type: "sse", deletedAt: null },
  });
  if (!channel) return 0;

  const { getConnectionCount } = await import("@/lib/sse/connection-registry");
  return getConnectionCount(channel.publicId);
}

/**
 * New stream URL for an SSE channel. The old URL stops working: new connections get 404, open
 * streams get no further messages (they are keyed by the publicId, see connection-registry).
 */
export async function regenerateChannelPublicId(channelId: string): Promise<string> {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.channel.findFirst({
    where: { id: channelId, organizationId: orgId, type: "sse", deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Channel not found");

  const channel = await prisma.channel.update({
    where: { id: channelId },
    data: { publicId: generatePublicId() },
    select: { publicId: true },
  });
  revalidatePath(`/channels/${channelId}/edit`);
  return channel.publicId;
}
