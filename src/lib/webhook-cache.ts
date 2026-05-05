import { Client } from "pg";
import { prisma } from "./db";
import { logger } from "./logger";

// Shape returned to the webhook route. This is a subset of the full Prisma
// object with only the fields the receiver hot path needs, plus the related
// Subscription row for in-line quota checks.
export interface CachedWebhook {
  id: string;
  organizationId: string;
  publicId: string;
  apiKey: string;
  requireAuth: boolean;
  enabled: boolean;
  titleTemplate: string | null;
  messageTemplate: string | null;
  tagsTemplate: string | null;
  priorityTemplate: string | null;
  channels: Array<{
    channelId: string;
    enabled: boolean;
    filter: unknown;
    channel: { id: string; enabled: boolean };
  }>;
  subscription: {
    plan: string;
    currentPeriodStart: Date | null;
    overrideMessageLimit: number | null;
    overrideWebhookLimit: number | null;
    overrideChannelLimit: number | null;
    overrideRetentionDays: number | null;
    purchasedPacks: number;
  };
}

interface CacheEntry {
  value: CachedWebhook | null;
  fetchedAt: number;
}

// TTL acts as a safety net in case LISTEN/NOTIFY misses an event (dropped
// connection, replication lag if the reader ever moves to a replica, etc.).
// Short enough that admin changes propagate quickly; long enough to matter
// under sustained webhook traffic.
const CACHE_TTL_MS = 30_000;
const NEGATIVE_CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 5_000;

const NOTIFY_CHANNEL = "alphorn_cache_invalidate";

const globalForCache = globalThis as unknown as {
  webhookCache?: Map<string, CacheEntry>;
  webhookCacheListener?: ListenerState;
};

const cache = (globalForCache.webhookCache ??= new Map<string, CacheEntry>());

interface ListenerState {
  client: Client | null;
  starting: Promise<void> | null;
  // When false, we've tried and failed to set up LISTEN (e.g. DATABASE_URL
  // unreachable). The cache still works in TTL-only mode.
  available: boolean;
}

function getListenerState(): ListenerState {
  return (globalForCache.webhookCacheListener ??= {
    client: null,
    starting: null,
    available: true,
  });
}

// Flush the entire cache. Used when the invalidation scope is broader than a
// single webhook (channel/subscription/webhook-channel edits, listener errors).
function flushCache(reason: string): void {
  if (cache.size === 0) return;
  logger.debug(
    { component: "webhook-cache", reason, size: cache.size },
    "Flushing webhook cache",
  );
  cache.clear();
}

// Invalidate a single publicId entry. Used for `Webhook:<publicId>` NOTIFY
// payloads, which cover the common case of a direct webhook edit (rename,
// toggle, template change, soft-delete).
function invalidatePublicId(publicId: string, reason: string): void {
  if (!cache.delete(publicId)) return;
  logger.debug(
    { component: "webhook-cache", reason, publicId },
    "Invalidated webhook cache entry",
  );
}

// Route a NOTIFY payload to targeted invalidation where possible, full flush
// otherwise. Payload shape is `<Table>:<key>` per the migration trigger.
// Only `Webhook:<publicId>` keys the cache directly; the others would need a
// reverse index and fall back to a full flush.
function handleInvalidate(payload: string): void {
  const colon = payload.indexOf(":");
  if (colon > 0) {
    const table = payload.slice(0, colon);
    const key = payload.slice(colon + 1);
    if (table === "Webhook" && key) {
      invalidatePublicId(key, `notify:${payload}`);
      return;
    }
  }
  flushCache(`notify:${payload}`);
}

async function startListener(): Promise<void> {
  const state = getListenerState();
  if (state.client || !state.available) return;
  if (state.starting) return state.starting;

  state.starting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (msg) => {
      if (msg.channel !== NOTIFY_CHANNEL) return;
      handleInvalidate(msg.payload ?? "");
    });
    client.on("error", (err) => {
      logger.warn(
        { component: "webhook-cache", err: err.message },
        "LISTEN client error — cache falls back to TTL-only until reconnect",
      );
      // Drop client; next cache miss will retry startListener.
      state.client = null;
      flushCache("listener-error");
    });
    client.on("end", () => {
      state.client = null;
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
      state.client = client;
      logger.info({ component: "webhook-cache" }, "LISTEN started");
    } catch (err) {
      logger.warn(
        {
          component: "webhook-cache",
          err: err instanceof Error ? err.message : String(err),
        },
        "Could not start LISTEN — cache will operate in TTL-only mode",
      );
      state.available = false;
      try {
        await client.end();
      } catch {
        // ignore close failure
      }
    } finally {
      state.starting = null;
    }
  })();

  return state.starting;
}

async function fetchWebhook(publicId: string): Promise<CachedWebhook | null> {
  // Soft-deleted webhooks must look like they no longer exist on the public
  // receiver. We still query by the unique publicId (to stay on the index) and
  // then discard the row if it's tombstoned.
  const row = await prisma.webhook.findUnique({
    where: { publicId },
    include: {
      channels: {
        include: {
          channel: { select: { id: true, enabled: true } },
        },
      },
      organization: {
        include: {
          subscription: {
            select: {
              plan: true,
              currentPeriodStart: true,
              overrideMessageLimit: true,
              overrideWebhookLimit: true,
              overrideChannelLimit: true,
              overrideRetentionDays: true,
              purchasedPacks: true,
            },
          },
        },
      },
    },
  });
  if (!row || row.deletedAt !== null) return null;

  // A Subscription row is guaranteed to exist by the create-on-org trigger.
  // If it's missing (e.g. the migration hasn't run yet), fall back to the
  // upsert path so we never crash the hot path on a legacy org.
  const subscription = row.organization.subscription ?? (await ensureSubscription(row.organizationId));

  return {
    id: row.id,
    organizationId: row.organizationId,
    publicId: row.publicId,
    apiKey: row.apiKey,
    requireAuth: row.requireAuth,
    enabled: row.enabled,
    titleTemplate: row.titleTemplate,
    messageTemplate: row.messageTemplate,
    tagsTemplate: row.tagsTemplate,
    priorityTemplate: row.priorityTemplate,
    channels: row.channels.map((wc) => ({
      channelId: wc.channelId,
      enabled: wc.enabled,
      filter: wc.filter,
      channel: { id: wc.channel.id, enabled: wc.channel.enabled },
    })),
    subscription,
  };
}

async function ensureSubscription(
  organizationId: string,
): Promise<CachedWebhook["subscription"]> {
  const created = await prisma.subscription.upsert({
    where: { organizationId },
    create: { organizationId, plan: "free", status: "active" },
    update: {},
    select: {
      plan: true,
      currentPeriodStart: true,
      overrideMessageLimit: true,
      overrideWebhookLimit: true,
      overrideChannelLimit: true,
      overrideRetentionDays: true,
      purchasedPacks: true,
    },
  });
  return created;
}

export async function getCachedWebhook(
  publicId: string,
): Promise<CachedWebhook | null> {
  // Start the LISTEN client opportunistically on first access. We don't wait
  // for it — if it fails we fall back to TTL-only, and in the meantime this
  // request still gets the fresh row it just fetched.
  const state = getListenerState();
  if (state.available && !state.client && !state.starting) {
    void startListener();
  }

  const now = Date.now();
  const cached = cache.get(publicId);
  if (cached) {
    const ttl = cached.value === null ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
    if (now - cached.fetchedAt < ttl) {
      return cached.value;
    }
    cache.delete(publicId);
  }

  const value = await fetchWebhook(publicId);

  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Drop the oldest insertion — Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(publicId, { value, fetchedAt: now });
  return value;
}

// Clear every cached entry. Useful for tests and for ops-level manual
// invalidation. Does not close the LISTEN client; subsequent calls continue
// to benefit from future NOTIFY events.
export function flushWebhookCache(): void {
  flushCache("manual");
}

// Test-only hook: resets cache AND listener state so individual cases start
// from a clean slate.
export function _resetWebhookCacheForTests(): void {
  cache.clear();
  const state = globalForCache.webhookCacheListener;
  if (state?.client) {
    void state.client.end().catch(() => {});
  }
  globalForCache.webhookCacheListener = undefined;
}
