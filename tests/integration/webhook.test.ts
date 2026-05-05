import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCachedWebhook: vi.fn(),
  persistMessage: vi.fn(),
  evaluateFilter: vi.fn(() => true),
  loggerChild: vi.fn(),
  checkQuota: vi.fn<
    (...args: unknown[]) => Promise<
      | { allowed: true }
      | { allowed: false; limit: number; usage: number; plan: string }
    >
  >(async () => ({ allowed: true })),
  countMessages: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 0),
  isBillingEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/webhook-cache", () => ({
  getCachedWebhook: mocks.getCachedWebhook,
}));

vi.mock("@/lib/delivery", () => ({
  persistMessageAndEnqueueDeliveries: mocks.persistMessage,
}));

vi.mock("@/lib/filter", () => ({
  evaluateFilter: mocks.evaluateFilter,
}));

vi.mock("@/lib/billing/subscription", () => ({
  checkMessageQuotaForSubscription: mocks.checkQuota,
  countMessagesInPeriod: mocks.countMessages,
  limitsForSubscription: () => ({
    messages: 100,
    webhooks: null,
    channels: null,
    retentionDays: null,
  }),
}));

vi.mock("@/lib/billing/paddle", () => ({
  isBillingEnabled: mocks.isBillingEnabled,
}));

vi.mock("@/lib/logger", () => {
  const logger = {
    child: mocks.loggerChild,
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  mocks.loggerChild.mockImplementation(() => logger);
  return { logger };
});

type MockWebhook = {
  id: string;
  organizationId: string;
  publicId: string;
  enabled: boolean;
  requireAuth: boolean;
  apiKey: string;
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
};

function buildWebhook(overrides: Partial<MockWebhook> = {}): MockWebhook {
  return {
    id: "wh_1",
    organizationId: "org_1",
    publicId: "public_1",
    enabled: true,
    requireAuth: false,
    apiKey: "secret-key",
    titleTemplate: null,
    messageTemplate: null,
    tagsTemplate: null,
    priorityTemplate: null,
    channels: [],
    subscription: {
      plan: "free",
      currentPeriodStart: null,
      overrideMessageLimit: null,
      overrideWebhookLimit: null,
      overrideChannelLimit: null,
      overrideRetentionDays: null,
      purchasedPacks: 0,
    },
    ...overrides,
  };
}

describe("POST /n/:publicId — webhook receiver", () => {
  beforeEach(() => {
    mocks.getCachedWebhook.mockReset();
    mocks.persistMessage.mockReset();
    mocks.persistMessage.mockResolvedValue({ messageId: "msg_default" });
    mocks.evaluateFilter.mockReset();
    mocks.evaluateFilter.mockImplementation((...args: unknown[]) => args[1] !== "reject");
    mocks.checkQuota.mockReset();
    mocks.checkQuota.mockResolvedValue({ allowed: true });
    mocks.countMessages.mockReset();
    mocks.countMessages.mockResolvedValue(0);
    mocks.isBillingEnabled.mockReset();
    mocks.isBillingEnabled.mockReturnValue(false);
    delete process.env.WEBHOOK_MAX_BODY_BYTES;
    delete process.env.WEBHOOK_MAX_HOPS;
  });

  it("returns 404 for unknown publicId", async () => {
    mocks.getCachedWebhook.mockResolvedValue(null);

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/missing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      }),
      { params: Promise.resolve({ publicId: "missing" }) }
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Not found" });
  });

  it("rejects missing bearer auth when the webhook requires authentication", async () => {
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook({ requireAuth: true }));

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/protected", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      }),
      { params: Promise.resolve({ publicId: "protected" }) }
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Missing or invalid Authorization header",
    });
  });

  it("rejects invalid API keys using the timing-safe check path", async () => {
    mocks.getCachedWebhook.mockResolvedValue(
      buildWebhook({ requireAuth: true, apiKey: "abcdefghij" })
    );

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/protected", {
        method: "POST",
        headers: {
          authorization: "Bearer zzzzzzzzzz",
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "test" }),
      }),
      { params: Promise.resolve({ publicId: "protected" }) }
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Invalid API key" });
  });

  it("returns 403 when the webhook is disabled", async () => {
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook({ enabled: false }));

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/disabled", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      }),
      { params: Promise.resolve({ publicId: "disabled" }) }
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Webhook is disabled" });
  });

  it("returns 400 for invalid JSON bodies", async () => {
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json{{",
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });

  it("parses native JSON payloads, filters channels, and persists with matching channel ids", async () => {
    mocks.persistMessage.mockResolvedValue({ messageId: "msg_1" });
    mocks.getCachedWebhook.mockResolvedValue(
      buildWebhook({
        channels: [
          {
            channelId: "ch_enabled",
            enabled: true,
            filter: "match",
            channel: { id: "ch_enabled", enabled: true },
          },
          {
            channelId: "ch_rejected",
            enabled: true,
            filter: "reject",
            channel: { id: "ch_rejected", enabled: true },
          },
          {
            channelId: "ch_disabled",
            enabled: false,
            filter: "match",
            channel: { id: "ch_disabled", enabled: true },
          },
        ],
      })
    );

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "CPU Alert",
          message: "usage high",
          priority: 3.6,
          tags: "infra",
          extra: { region: "eu-west-1" },
        }),
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ messageId: "msg_1" });
    expect(mocks.evaluateFilter).toHaveBeenCalledTimes(2);
    expect(mocks.persistMessage).toHaveBeenCalledWith({
      webhookId: "wh_1",
      title: "CPU Alert",
      message: "usage high",
      priority: 4,
      tags: ["infra"],
      payload: {
        title: "CPU Alert",
        message: "usage high",
        priority: 3.6,
        tags: "infra",
        extra: { region: "eu-west-1" },
      },
      channelIds: ["ch_enabled"],
      trace: ["public_1"],
    });
  });

  it("normalizes Slack-compatible JSON payloads and passes no channel ids when nothing matches", async () => {
    mocks.persistMessage.mockResolvedValue({ messageId: "msg_slack" });

    mocks.getCachedWebhook.mockResolvedValue(
      buildWebhook({
        channels: [
          {
            channelId: "ch_rejected",
            enabled: true,
            filter: "reject",
            channel: { id: "ch_rejected", enabled: true },
          },
        ],
      })
    );

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: "Slack body",
          attachments: [{ title: "Slack title" }],
          tags: ["ops", 123],
        }),
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );

    expect(res.status).toBe(201);
    expect(mocks.persistMessage).toHaveBeenCalledWith({
      webhookId: "wh_1",
      title: "Slack title",
      message: "Slack body",
      priority: null,
      tags: ["ops"],
      payload: {
        text: "Slack body",
        attachments: [{ title: "Slack title" }],
        tags: ["ops", 123],
      },
      channelIds: [],
      trace: ["public_1"],
    });
  });

  it("parses plain text mode from request headers", async () => {
    mocks.persistMessage.mockResolvedValue({ messageId: "msg_text" });
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "x-title": "Text alert",
          "x-priority": "not-a-number",
          "x-tags": "ops,  urgent ,,",
        },
        body: "plain body",
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );

    expect(res.status).toBe(201);
    expect(mocks.persistMessage).toHaveBeenCalledWith({
      webhookId: "wh_1",
      title: "Text alert",
      message: "plain body",
      priority: null,
      tags: ["ops", "urgent"],
      payload: null,
      channelIds: [],
      trace: ["public_1"],
    });
  });

  it("falls back to body/msg fields and default plain-text title when native fields are sparse", async () => {
    mocks.persistMessage
      .mockResolvedValueOnce({ messageId: "msg_body" })
      .mockResolvedValueOnce({ messageId: "msg_msg" })
      .mockResolvedValueOnce({ messageId: "msg_plain" });

    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { POST } = await import("@/app/n/[publicId]/route");

    await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "body field" }),
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );
    await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msg: "msg field", tags: ["ok", 1] }),
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );
    await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        body: "plain body",
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );

    expect(mocks.persistMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: null,
        message: "body field",
        tags: [],
      })
    );
    expect(mocks.persistMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: null,
        message: "msg field",
        tags: ["ok"],
      })
    );
    expect(mocks.persistMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        title: null,
        message: "plain body",
        tags: [],
      })
    );
  });

  it("returns 413 when the body exceeds WEBHOOK_MAX_BODY_BYTES", async () => {
    process.env.WEBHOOK_MAX_BODY_BYTES = "64";
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { POST } = await import("@/app/n/[publicId]/route");
    const oversizedBody = JSON.stringify({ message: "x".repeat(1024) });
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: oversizedBody,
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: "Payload too large",
      limit: 64,
    });
    expect(mocks.persistMessage).not.toHaveBeenCalled();
  });

  it("rejects over-quota requests before parsing the body", async () => {
    mocks.isBillingEnabled.mockReturnValue(true);
    mocks.checkQuota.mockResolvedValue({
      allowed: false,
      limit: 100,
      usage: 150,
      plan: "free",
    });
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "this is not valid JSON but should never be parsed",
      }),
      { params: Promise.resolve({ publicId: "public_1" }) }
    );

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "Message quota exceeded",
      limit: 100,
      usage: 150,
      plan: "free",
    });
    expect(mocks.persistMessage).not.toHaveBeenCalled();
  });

  it("rejects with 508 when the verified trace length reaches the hop limit", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.WEBHOOK_MAX_HOPS = "3";
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { signTrace, __resetKeyCacheForTests } = await import(
      "@/lib/webhook-loop/hops"
    );
    __resetKeyCacheForTests();
    const trace = signTrace(["pub_other_1", "pub_other_2", "pub_other_3"]);

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alphorn-trace": trace,
        },
        body: JSON.stringify({ message: "looping" }),
      }),
      { params: Promise.resolve({ publicId: "public_1" }) },
    );

    expect(res.status).toBe(508);
    expect(mocks.persistMessage).not.toHaveBeenCalled();
  });

  it("rejects with 508 when the verified trace already contains this webhook's publicId", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { signTrace, __resetKeyCacheForTests } = await import(
      "@/lib/webhook-loop/hops"
    );
    __resetKeyCacheForTests();
    const trace = signTrace(["public_1"]);

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alphorn-trace": trace,
        },
        body: JSON.stringify({ message: "self in trace" }),
      }),
      { params: Promise.resolve({ publicId: "public_1" }) },
    );

    expect(res.status).toBe(508);
    expect(mocks.persistMessage).not.toHaveBeenCalled();
  });

  it("ignores an invalid trace signature and treats the trace as empty", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    mocks.persistMessage.mockResolvedValue({ messageId: "msg_spoof" });
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alphorn-trace": "totally.bogus",
        },
        body: JSON.stringify({ message: "spoofed" }),
      }),
      { params: Promise.resolve({ publicId: "public_1" }) },
    );

    expect(res.status).toBe(201);
    expect(mocks.persistMessage).toHaveBeenCalledWith(
      expect.objectContaining({ trace: ["public_1"] }),
    );
  });

  it("propagates the verified trace forward with this webhook's publicId appended", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    mocks.persistMessage.mockResolvedValue({ messageId: "msg_chain" });
    mocks.getCachedWebhook.mockResolvedValue(buildWebhook());

    const { signTrace, __resetKeyCacheForTests } = await import(
      "@/lib/webhook-loop/hops"
    );
    __resetKeyCacheForTests();
    const trace = signTrace(["pub_upstream"]);

    const { POST } = await import("@/app/n/[publicId]/route");
    const res = await POST(
      new NextRequest("https://notifex.test/n/public_1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alphorn-trace": trace,
        },
        body: JSON.stringify({ message: "chain" }),
      }),
      { params: Promise.resolve({ publicId: "public_1" }) },
    );

    expect(res.status).toBe(201);
    expect(mocks.persistMessage).toHaveBeenCalledWith(
      expect.objectContaining({ trace: ["pub_upstream", "public_1"] }),
    );
  });
});
