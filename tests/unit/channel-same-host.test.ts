import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/channels/mattermost";
import "@/channels/gotify";
import "@/channels/ntfy";
import "@/channels/zulip";
import "@/channels/matrix";
import { getChannel } from "@/channels/registry";
import { verifyTrace, __resetKeyCacheForTests } from "@/lib/webhook-loop/hops";

const SAME_HOST = "https://app.alphorn.dev";

beforeEach(() => {
  process.env.BETTER_AUTH_URL = SAME_HOST;
  process.env.BETTER_AUTH_SECRET = "test-secret";
  __resetKeyCacheForTests();
});

describe("channel same-host loop guard", () => {
  it("webhookUrlConfigSchema rejects a URL pointing at this instance", () => {
    const handler = getChannel("mattermost")!;
    expect(handler.configSchema.safeParse({ webhookUrl: `${SAME_HOST}/n/abc` }).success).toBe(false);
    expect(handler.configSchema.safeParse({ webhookUrl: "https://mm.example.com/hooks/x" }).success).toBe(true);
  });

  it("gotify serverUrl rejects this instance's host", () => {
    const handler = getChannel("gotify")!;
    expect(handler.configSchema.safeParse({ serverUrl: SAME_HOST, appToken: "t" }).success).toBe(false);
    expect(handler.configSchema.safeParse({ serverUrl: "https://gotify.example.com", appToken: "t" }).success).toBe(true);
  });

  it("ntfy serverUrl rejects this instance's host and still applies the default", () => {
    const handler = getChannel("ntfy")!;
    expect(handler.configSchema.safeParse({ serverUrl: SAME_HOST, topic: "t" }).success).toBe(false);
    const withDefault = handler.configSchema.safeParse({ topic: "t" });
    expect(withDefault.success).toBe(true);
  });

  it("zulip serverUrl rejects this instance's host", () => {
    const handler = getChannel("zulip")!;
    const base = { botEmail: "b@example.com", apiKey: "k", stream: "s", topic: "t" };
    expect(handler.configSchema.safeParse({ serverUrl: SAME_HOST, ...base }).success).toBe(false);
    expect(handler.configSchema.safeParse({ serverUrl: "https://zulip.example.com", ...base }).success).toBe(true);
  });

  it("matrix homeserverUrl rejects this instance's host", () => {
    const handler = getChannel("matrix")!;
    const base = { accessToken: "tok", roomId: "!r:example.com" };
    expect(handler.configSchema.safeParse({ homeserverUrl: SAME_HOST, ...base }).success).toBe(false);
    expect(handler.configSchema.safeParse({ homeserverUrl: "https://matrix.example.com", ...base }).success).toBe(true);
  });
});

describe("channel trace header", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("mattermost sends a valid signed trace header carrying the upstream hops", async () => {
    const captured: Record<string, string>[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      captured.push(init.headers as Record<string, string>);
      return new Response(null, { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = getChannel("mattermost")!;
    await handler.send(
      { webhookUrl: "https://mm.example.com/hooks/x" },
      { title: null, message: "hi" },
      { channelId: "c", deliveryId: "d", trace: ["pub_up"] },
    );

    expect(verifyTrace(captured[0]["x-alphorn-trace"])).toEqual(["pub_up"]);
  });
});
