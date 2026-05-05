"use server";

import { prisma } from "@/lib/db";
import { requireSession, requireOrgSession, requireAdminOrOwner } from "@/lib/auth/server";
import { getOrgLimits } from "@/lib/billing/subscription";
import { generateApiKey, generatePublicId, generateWebhookId } from "@/lib/api-key";
import { revalidatePath } from "next/cache";
import { FilterDefinition as FilterDefinitionSchema } from "@/lib/filter/schema";
import type { FilterDefinition } from "@/lib/filter/schema";
import { z } from "zod";

const templateStringSchema = z
  .string()
  .max(500, "Template must be 500 characters or fewer")
  .nullable()
  .optional();

const webhookTemplatesSchema = z.object({
  titleTemplate: templateStringSchema,
  messageTemplate: templateStringSchema,
  tagsTemplate: templateStringSchema,
  priorityTemplate: templateStringSchema,
});

function validateFilters(channelFilters?: Record<string, FilterDefinition | null>) {
  if (!channelFilters) return;
  for (const filter of Object.values(channelFilters)) {
    if (filter !== null) {
      FilterDefinitionSchema.parse(filter);
    }
  }
}

async function assertChannelsBelongToOrg(channelIds: string[], orgId: string) {
  if (channelIds.length === 0) return;
  const unique = Array.from(new Set(channelIds));
  const count = await prisma.channel.count({
    where: { id: { in: unique }, organizationId: orgId },
  });
  if (count !== unique.length) {
    throw new Error("One or more channels do not belong to this project");
  }
}

export async function getWebhooksForOrg() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return [];

  return prisma.webhook.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: {
      channels: {
        include: { channel: true },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWebhookById(id: string) {
  const { orgId } = await requireOrgSession();

  return prisma.webhook.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    include: {
      channels: {
        include: { channel: true },
      },
    },
  });
}

export async function createWebhook(data: {
  name: string;
  description?: string;
  requireAuth?: boolean;
  channelIds: string[];
  channelFilters?: Record<string, FilterDefinition | null>;
  titleTemplate?: string | null;
  messageTemplate?: string | null;
  tagsTemplate?: string | null;
  priorityTemplate?: string | null;
}) {
  const { orgId } = await requireAdminOrOwner();

  const limits = await getOrgLimits(orgId);
  if (limits?.webhooks !== null && limits?.webhooks !== undefined) {
    const currentCount = await prisma.webhook.count({
      where: { organizationId: orgId, deletedAt: null },
    });
    if (currentCount >= limits.webhooks) {
      throw new Error(
        `Webhook limit reached (${limits.webhooks}). Upgrade your plan for more.`,
      );
    }
  }

  validateFilters(data.channelFilters);
  await assertChannelsBelongToOrg(data.channelIds, orgId);

  const templates = webhookTemplatesSchema.parse({
    titleTemplate: data.titleTemplate ?? null,
    messageTemplate: data.messageTemplate ?? null,
    tagsTemplate: data.tagsTemplate ?? null,
    priorityTemplate: data.priorityTemplate ?? null,
  });

  const webhook = await prisma.webhook.create({
    data: {
      id: generateWebhookId(),
      name: data.name,
      description: data.description || null,
      apiKey: generateApiKey(),
      publicId: generatePublicId(),
      requireAuth: data.requireAuth ?? true,
      organizationId: orgId,
      titleTemplate: templates.titleTemplate ?? null,
      messageTemplate: templates.messageTemplate ?? null,
      tagsTemplate: templates.tagsTemplate ?? null,
      priorityTemplate: templates.priorityTemplate ?? null,
      channels: {
        create: data.channelIds.map((channelId) => ({
          channelId,
          filter: data.channelFilters?.[channelId] ?? undefined,
        })),
      },
    },
  });

  revalidatePath("/webhooks");
  return webhook;
}

export async function updateWebhook(
  id: string,
  data: {
    name: string;
    description?: string;
    enabled: boolean;
    requireAuth: boolean;
    channelIds: string[];
    channelFilters?: Record<string, FilterDefinition | null>;
    titleTemplate?: string | null;
    messageTemplate?: string | null;
    tagsTemplate?: string | null;
    priorityTemplate?: string | null;
  }
) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.webhook.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Webhook not found");

  validateFilters(data.channelFilters);
  await assertChannelsBelongToOrg(data.channelIds, orgId);

  const templates = webhookTemplatesSchema.parse({
    titleTemplate: data.titleTemplate ?? null,
    messageTemplate: data.messageTemplate ?? null,
    tagsTemplate: data.tagsTemplate ?? null,
    priorityTemplate: data.priorityTemplate ?? null,
  });

  await prisma.$transaction([
    prisma.webhookChannel.deleteMany({ where: { webhookId: id } }),
    prisma.webhook.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description || null,
        enabled: data.enabled,
        requireAuth: data.requireAuth,
        titleTemplate: templates.titleTemplate ?? null,
        messageTemplate: templates.messageTemplate ?? null,
        tagsTemplate: templates.tagsTemplate ?? null,
        priorityTemplate: templates.priorityTemplate ?? null,
        channels: {
          create: data.channelIds.map((channelId) => ({
            channelId,
            filter: data.channelFilters?.[channelId] ?? undefined,
          })),
        },
      },
    }),
  ]);

  revalidatePath("/webhooks");
}

export async function deleteWebhook(id: string) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.webhook.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Webhook not found");

  // Soft-delete: tombstone the row so Messages/Deliveries retain history.
  // The Webhook UPDATE trigger flushes the receiver cache (/n/:publicId -> 404).
  await prisma.webhook.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false },
  });
  revalidatePath("/webhooks");
}

export async function regenerateApiKey(id: string) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.webhook.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Webhook not found");

  const webhook = await prisma.webhook.update({
    where: { id },
    data: { apiKey: generateApiKey() },
  });

  revalidatePath("/webhooks");
  return webhook.apiKey;
}

export async function updateWebhookRequireAuth(id: string, requireAuth: boolean) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.webhook.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Webhook not found");

  await prisma.webhook.update({
    where: { id },
    data: { requireAuth },
  });

  revalidatePath("/webhooks");
}

export async function updateWebhookChannels(
  webhookId: string,
  data: {
    channelIds: string[];
    channelFilters?: Record<string, FilterDefinition | null>;
  }
) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.webhook.findFirst({
    where: { id: webhookId, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Webhook not found");

  validateFilters(data.channelFilters);
  await assertChannelsBelongToOrg(data.channelIds, orgId);

  await prisma.$transaction([
    prisma.webhookChannel.deleteMany({ where: { webhookId } }),
    ...data.channelIds.map((channelId) =>
      prisma.webhookChannel.create({
        data: {
          webhookId,
          channelId,
          filter: data.channelFilters?.[channelId] ?? undefined,
        },
      })
    ),
  ]);

  revalidatePath("/webhooks");
}

export async function toggleWebhookChannel(
  webhookId: string,
  channelId: string,
  enabled: boolean
) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.webhook.findFirst({
    where: { id: webhookId, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Webhook not found");

  await prisma.webhookChannel.update({
    where: { webhookId_channelId: { webhookId, channelId } },
    data: { enabled },
  });

  revalidatePath("/webhooks");
}

export async function regeneratePublicId(id: string) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.webhook.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Webhook not found");

  const webhook = await prisma.webhook.update({
    where: { id },
    data: { publicId: generatePublicId() },
  });

  revalidatePath("/webhooks");
  return webhook.publicId;
}
