import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/channels/forward";
import { getChannel } from "@/channels/registry";
import { TRACE_HEADER } from "@/lib/webhook-loop/hops";

const handler = getChannel("forward")!;
const config = { url: "https://ci.example.com/hooks", method: "POST", headers: {} };
const context = { channelId: "c", deliveryId: "d", trace: ["abc123"] };

function mockFetch(status = 200) {
  return vi.fn().mockResolvedValue(new Response("{}", { status }));
}

function sent(fetchMock: ReturnType<typeof mockFetch>) {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return { headers: init.headers as Record<string, string>, body: init.body as string };
}

describe("forward channel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("relays the original payload and headers without the Alphorn envelope", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(
      config,
      {
        title: "[a/b] PR #1 opened",
        message: "m",
        priority: 4,
        payload: { action: "opened", number: 1 },
        headers: { "content-type": "application/json", "x-github-event": "pull_request" },
      },
      context
    );

    const { headers, body } = sent(fetchMock);
    expect(JSON.parse(body)).toEqual({ action: "opened", number: 1 });
    expect(headers["x-github-event"]).toBe("pull_request");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers[TRACE_HEADER]).toBeTruthy();
  });

  it("lets custom headers override forwarded ones but never the trace header", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(
      { ...config, headers: { "x-github-event": "custom", authorization: "Bearer target" } },
      { title: null, message: "m", payload: {}, headers: { "x-github-event": "push" } },
      context
    );

    const { headers } = sent(fetchMock);
    expect(headers["x-github-event"]).toBe("custom");
    expect(headers.authorization).toBe("Bearer target");
    expect(headers[TRACE_HEADER]).toBeTruthy();
  });

  it("relays text bodies as the stored message", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(config, { title: null, message: "disk full" }, context);

    const { headers, body } = sent(fetchMock);
    expect(body).toBe("disk full");
    expect(headers["content-type"]).toBe("text/plain; charset=utf-8");
  });

  it("rejects a target URL pointing at this Alphorn instance", () => {
    expect(handler.configSchema.safeParse({ url: "https://app.example.com/n/abc123" }).success).toBe(false);
    expect(handler.configSchema.safeParse({ url: "https://ci.example.com/hooks" }).success).toBe(true);
  });

  it("throws on a failed response so the job is retried", async () => {
    globalThis.fetch = mockFetch(502) as unknown as typeof fetch;
    await expect(
      handler.send(config, { title: null, message: "m", payload: {} }, context)
    ).rejects.toThrow();
  });
});
