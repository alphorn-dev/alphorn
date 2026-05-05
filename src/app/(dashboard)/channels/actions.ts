"use server";

import { prisma } from "@/lib/db";
import { requireSession, requireAdminOrOwner } from "@/lib/auth/server";
import { getOrgLimits } from "@/lib/billing/subscription";
import { getChannel } from "@/channels";
import { generateChannelId } from "@/lib/api-key";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";

export async function getChannelsForOrg() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return [];

  return prisma.channel.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getChannelById(id: string) {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;

  return prisma.channel.findFirst({
    where: { id, organizationId: orgId },
  });
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
      where: { organizationId: orgId },
    });
    if (currentCount >= limits.channels) {
      throw new Error(
        `Channel limit reached (${limits.channels}). Upgrade your plan for more.`,
      );
    }
  }

  const handler = getChannel(data.type);
  if (!handler) throw new Error(`Unknown channel type: ${data.type}`);

  handler.configSchema.parse(data.config);

  const channel = await prisma.channel.create({
    data: {
      id: generateChannelId(),
      name: data.name,
      type: data.type,
      config: data.config as unknown as Prisma.InputJsonValue,
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
    where: { id, organizationId: orgId },
  });
  if (!existing) throw new Error("Channel not found");

  const handler = getChannel(existing.type);
  if (handler) {
    handler.configSchema.parse(data.config);
  }

  const channel = await prisma.channel.update({
    where: { id },
    data: {
      name: data.name,
      config: data.config as unknown as Prisma.InputJsonValue,
      enabled: data.enabled,
    },
  });

  revalidatePath("/channels");
  return channel;
}

export async function deleteChannel(id: string) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.channel.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!existing) throw new Error("Channel not found");

  await prisma.channel.delete({ where: { id } });
  revalidatePath("/channels");
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
    where: { id, organizationId: orgId },
  });
  if (!channel) throw new Error("Channel not found");

  const handler = getChannel(channel.type);
  if (!handler) throw new Error(`Unknown channel type: ${channel.type}`);
  if (!handler.test) throw new Error("This channel does not support testing");

  await handler.test(channel.config);
}

export async function getSseConnectionCount(channelId: string): Promise<number> {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return 0;

  const channel = await prisma.channel.findFirst({
    where: { id: channelId, organizationId: orgId, type: "sse" },
  });
  if (!channel) return 0;

  const { getConnectionCount } = await import("@/lib/sse/connection-registry");
  return getConnectionCount(channel.id);
}
