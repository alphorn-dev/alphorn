"use server";

import { prisma } from "@/lib/db";
import { requireSession, requireOrgSession, requireAdminOrOwner } from "@/lib/auth/server";
import { getOrgLimits } from "@/lib/billing/subscription";
import { assertWebhookLimit } from "@/lib/webhook-limit";
import { GITHUB_EVENT_IDS } from "@/lib/github/events";
import {
  generateApiKey,
  generatePublicId,
  generateWebhookId,
  hashApiKey,
  apiKeyPrefix,
} from "@/lib/api-key";
import { revalidatePath } from "next/cache";
import { FilterDefinition as FilterDefinitionSchema } from "@/lib/filter/schema";
import type { FilterDefinition } from "@/lib/filter/schema";
import { z } from "zod";
import { descriptionSchema, resourceNameSchema } from "@/lib/schemas";
import { EXTRACT_MODES, type ExtractMode } from "@/lib/webhook-extract/mode";

const templateStringSchema = z
  .string()
  .max(500, "Template must be 500 characters or fewer")
  .nullable()
  .optional();

const webhookTemplatesSchema = z.object({
  extractMode: z.enum(EXTRACT_MODES),
  titleTemplate: templateStringSchema,
  messageTemplate: templateStringSchema,
  tagsTemplate: templateStringSchema,
  priorityTemplate: templateStringSchema,
});

// Returns the parsed filters: stored as parsed, so unknown keys never reach the DB.
function validateFilters(
  channelFilters?: Record<string, FilterDefinition | null>,
): Record<string, FilterDefinition | null> {
  const parsed: Record<string, FilterDefinition | null> = {};
  for (const [channelId, filter] of Object.entries(channelFilters ?? {})) {
    parsed[channelId] = filter === null ? null : FilterDefinitionSchema.parse(filter);
  }
  return parsed;
}

const webhookMetaSchema = z.object({ name: resourceNameSchema, description: descriptionSchema });

async function loadLinkEnabledMap(webhookId: string) {
  const links = await prisma.webhookChannel.findMany({
    where: { webhookId },
    select: { channelId: true, enabled: true },
  });
  return new Map(links.map((l) => [l.channelId, l.enabled]));
}

async function assertChannelsBelongToOrg(channelIds: string[], orgId: string) {
  if (channelIds.length === 0) return;
  const unique = Array.from(new Set(channelIds));
  const count = await prisma.channel.count({
    where: { id: { in: unique }, organizationId: orgId, deletedAt: null },
  });
  if (count !== unique.length) {
    throw new Error("One or more channels do not belong to this project");
  }
}

export async function getWebhooksForOrg() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return [];

  // Never ship key material (apiKeyHash) or channel configs (credentials) to
  // the list view - it only renders names, counts, and status.
  return prisma.webhook.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
      enabled: true,
      createdAt: true,
      channels: {
        select: {
          channelId: true,
          channel: { select: { name: true } },
        },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWebhookById(id: string) {
  const { orgId } = await requireOrgSession();

  // apiKeyPrefix is safe to display; apiKeyHash and channel configs are not
  // shipped to the client (the detail page is visible to any org member).
  return prisma.webhook.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      enabled: true,
      requireAuth: true,
      apiKeyPrefix: true,
      publicId: true,
      extractMode: true,
      titleTemplate: true,
      messageTemplate: true,
      tagsTemplate: true,
      priorityTemplate: true,
      channels: {
        select: {
          channelId: true,
          enabled: true,
          filter: true,
          channel: { select: { id: true, name: true, type: true } },
        },
      },
      githubInstallation: {
        select: { installationId: true, events: true, suspendedAt: true },
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
  extractMode?: ExtractMode;
  titleTemplate?: string | null;
  messageTemplate?: string | null;
  tagsTemplate?: string | null;
  priorityTemplate?: string | null;
}) {
  const { orgId } = await requireAdminOrOwner();

  await assertWebhookLimit(orgId);

  const meta = webhookMetaSchema.parse({ name: data.name, description: data.description });
  const filters = validateFilters(data.channelFilters);
  await assertChannelsBelongToOrg(data.channelIds, orgId);

  const templates = webhookTemplatesSchema.parse({
    extractMode: data.extractMode ?? "auto",
    titleTemplate: data.titleTemplate ?? null,
    messageTemplate: data.messageTemplate ?? null,
    tagsTemplate: data.tagsTemplate ?? null,
    priorityTemplate: data.priorityTemplate ?? null,
  });

  const apiKey = generateApiKey();
  const webhook = await prisma.webhook.create({
    data: {
      id: generateWebhookId(),
      name: meta.name,
      description: meta.description || null,
      apiKeyHash: hashApiKey(apiKey),
      apiKeyPrefix: apiKeyPrefix(apiKey),
      publicId: generatePublicId(),
      requireAuth: data.requireAuth ?? false,
      organizationId: orgId,
      extractMode: templates.extractMode,
      titleTemplate: templates.titleTemplate ?? null,
      messageTemplate: templates.messageTemplate ?? null,
      tagsTemplate: templates.tagsTemplate ?? null,
      priorityTemplate: templates.priorityTemplate ?? null,
      channels: {
        create: data.channelIds.map((channelId) => ({
          channelId,
          filter: filters[channelId] ?? undefined,
        })),
      },
    },
  });

  revalidatePath("/webhooks");
  // Return the plaintext key once - it is never recoverable from the DB after
  // this. The caller shows it to the user and discards it.
  return { id: webhook.id, apiKey };
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
    extractMode: ExtractMode;
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

  // Re-enabling must respect the plan limit enforcePlanLimits applies on
  // downgrade (counted over enabled rows, unlike creation).
  if (data.enabled && !existing.enabled) {
    const limits = await getOrgLimits(orgId);
    if (limits?.webhooks !== null && limits?.webhooks !== undefined) {
      const enabledCount = await prisma.webhook.count({
        where: { organizationId: orgId, enabled: true, deletedAt: null },
      });
      if (enabledCount >= limits.webhooks) {
        throw new Error(
          `Webhook limit reached (${limits.webhooks} enabled). Upgrade your plan or disable another webhook.`,
        );
      }
    }
  }

  const meta = webhookMetaSchema.parse({ name: data.name, description: data.description });
  const filters = validateFilters(data.channelFilters);
  await assertChannelsBelongToOrg(data.channelIds, orgId);

  const templates = webhookTemplatesSchema.parse({
    extractMode: data.extractMode,
    titleTemplate: data.titleTemplate ?? null,
    messageTemplate: data.messageTemplate ?? null,
    tagsTemplate: data.tagsTemplate ?? null,
    priorityTemplate: data.priorityTemplate ?? null,
  });

  // Recreating the links would reset `enabled` to its default and silently
  // un-mute channels toggled off via toggleWebhookChannel - carry it over.
  const enabledByChannel = await loadLinkEnabledMap(id);

  await prisma.$transaction([
    prisma.webhookChannel.deleteMany({ where: { webhookId: id } }),
    prisma.webhook.update({
      where: { id },
      data: {
        name: meta.name,
        description: meta.description || null,
        enabled: data.enabled,
        requireAuth: data.requireAuth,
        extractMode: templates.extractMode,
        titleTemplate: templates.titleTemplate ?? null,
        messageTemplate: templates.messageTemplate ?? null,
        tagsTemplate: templates.tagsTemplate ?? null,
        priorityTemplate: templates.priorityTemplate ?? null,
        channels: {
          create: data.channelIds.map((channelId) => ({
            channelId,
            filter: filters[channelId] ?? undefined,
            enabled: enabledByChannel.get(channelId) ?? true,
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
  // A GitHub connection is unlinked too, so the installation can be
  // connected again (its installationId is unique).
  await prisma.$transaction([
    prisma.githubInstallation.deleteMany({ where: { webhookId: id } }),
    prisma.webhook.update({
      where: { id },
      data: { deletedAt: new Date(), enabled: false },
    }),
  ]);
  revalidatePath("/webhooks");
}

export async function regenerateApiKey(id: string) {
  const { orgId } = await requireAdminOrOwner();

  const existing = await prisma.webhook.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
  });
  if (!existing) throw new Error("Webhook not found");

  const apiKey = generateApiKey();
  await prisma.webhook.update({
    where: { id },
    data: { apiKeyHash: hashApiKey(apiKey), apiKeyPrefix: apiKeyPrefix(apiKey) },
  });

  revalidatePath("/webhooks");
  // Plaintext returned once; only the hash is persisted.
  return apiKey;
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

  const filters = validateFilters(data.channelFilters);
  await assertChannelsBelongToOrg(data.channelIds, orgId);

  const enabledByChannel = await loadLinkEnabledMap(webhookId);

  await prisma.$transaction([
    prisma.webhookChannel.deleteMany({ where: { webhookId } }),
    ...data.channelIds.map((channelId) =>
      prisma.webhookChannel.create({
        data: {
          webhookId,
          channelId,
          filter: filters[channelId] ?? undefined,
          enabled: enabledByChannel.get(channelId) ?? true,
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

export async function updateGithubEvents(webhookId: string, events: string[]) {
  const { orgId } = await requireAdminOrOwner();
  const parsed = z.array(z.enum(GITHUB_EVENT_IDS)).max(GITHUB_EVENT_IDS.length).parse(events);

  const { count } = await prisma.githubInstallation.updateMany({
    where: { webhookId, organizationId: orgId },
    data: { events: Array.from(new Set(parsed)) },
  });
  if (count === 0) throw new Error("GitHub connection not found");

  revalidatePath(`/webhooks/${webhookId}`);
}
