import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  subscriptionUpsert: vi.fn(),
  pgConnect: vi.fn(),
  pgQuery: vi.fn(),
  pgEnd: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    webhook: { findUnique: mocks.findUnique },
    subscription: { upsert: mocks.subscriptionUpsert },
  },
}));

vi.mock("pg", () => {
  class Client {
    on = vi.fn();
    connect = mocks.pgConnect;
    query = mocks.pgQuery;
    end = mocks.pgEnd;
  }
  return { Client };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh_1",
    organizationId: "org_1",
    publicId: "pub_1",
    apiKey: "key",
    requireAuth: false,
    enabled: true,
    deletedAt: null,
    titleTemplate: null,
    messageTemplate: null,
    tagsTemplate: null,
    priorityTemplate: null,
    channels: [
      {
        channelId: "ch_1",
        enabled: true,
        filter: null,
        channel: { id: "ch_1", enabled: true },
      },
    ],
    organization: {
      subscription: {
        plan: "free",
        currentPeriodStart: null,
        overrideMessageLimit: null,
        overrideWebhookLimit: null,
        overrideChannelLimit: null,
        overrideRetentionDays: null,
        purchasedPacks: 0,
      },
    },
    ...overrides,
  };
}

describe("webhook-cache", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.findUnique.mockReset();
    mocks.subscriptionUpsert.mockReset();
    mocks.pgConnect.mockReset().mockResolvedValue(undefined);
    mocks.pgQuery.mockReset().mockResolvedValue(undefined);
    mocks.pgEnd.mockReset().mockResolvedValue(undefined);
    const mod = await import("@/lib/webhook-cache");
    mod._resetWebhookCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the fetched row and caches it so the second call skips Prisma", async () => {
    mocks.findUnique.mockResolvedValueOnce(buildRow());
    const { getCachedWebhook } = await import("@/lib/webhook-cache");

    const first = await getCachedWebhook("pub_1");
    const second = await getCachedWebhook("pub_1");

    expect(first?.id).toBe("wh_1");
    expect(first?.subscription.plan).toBe("free");
    expect(second).toBe(first);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });

  it("treats soft-deleted webhooks as not found", async () => {
    mocks.findUnique.mockResolvedValueOnce(
      buildRow({ deletedAt: new Date("2026-04-21T00:00:00Z") }),
    );
    const { getCachedWebhook } = await import("@/lib/webhook-cache");

    const result = await getCachedWebhook("pub_1");

    expect(result).toBeNull();
  });

  it("caches null results under a short negative TTL", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const { getCachedWebhook } = await import("@/lib/webhook-cache");

    const a = await getCachedWebhook("missing");
    const b = await getCachedWebhook("missing");

    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after the positive TTL elapses", async () => {
    vi.useFakeTimers();
    mocks.findUnique
      .mockResolvedValueOnce(buildRow())
      .mockResolvedValueOnce(buildRow({ enabled: false }));
    const { getCachedWebhook } = await import("@/lib/webhook-cache");

    const first = await getCachedWebhook("pub_1");
    expect(first?.enabled).toBe(true);

    // TTL is 30s; jump just past it.
    vi.advanceTimersByTime(30_001);
    const second = await getCachedWebhook("pub_1");

    expect(second?.enabled).toBe(false);
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("flushWebhookCache forces the next call to re-fetch", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(buildRow({ enabled: true }))
      .mockResolvedValueOnce(buildRow({ enabled: false }));
    const { getCachedWebhook, flushWebhookCache } = await import(
      "@/lib/webhook-cache"
    );

    const first = await getCachedWebhook("pub_1");
    flushWebhookCache();
    const second = await getCachedWebhook("pub_1");

    expect(first?.enabled).toBe(true);
    expect(second?.enabled).toBe(false);
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("falls back to upsert when the organization has no subscription row yet", async () => {
    const row = buildRow();
    row.organization.subscription = null as unknown as typeof row.organization.subscription;
    mocks.findUnique.mockResolvedValueOnce(row);
    mocks.subscriptionUpsert.mockResolvedValueOnce({
      plan: "free",
      currentPeriodStart: null,
      overrideMessageLimit: null,
      overrideWebhookLimit: null,
      overrideChannelLimit: null,
      overrideRetentionDays: null,
      purchasedPacks: 0,
    });
    const { getCachedWebhook } = await import("@/lib/webhook-cache");

    const result = await getCachedWebhook("pub_1");

    expect(result?.subscription.plan).toBe("free");
    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1" },
        create: expect.objectContaining({ organizationId: "org_1" }),
      }),
    );
  });
});
