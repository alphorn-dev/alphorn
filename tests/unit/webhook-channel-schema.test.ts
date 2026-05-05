import { beforeEach, describe, expect, it, vi } from "vitest";

describe("webhook channel configSchema — same-host block", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "https://app.alphorn.dev";
    process.env.BETTER_AUTH_SECRET = "test-secret";
    vi.resetModules();
  });

  it("rejects a URL that matches BETTER_AUTH_URL's host", async () => {
    const { getChannel } = await import("@/channels");
    const handler = getChannel("webhook")!;
    const result = handler.configSchema.safeParse({
      url: "https://app.alphorn.dev/n/abc",
      method: "POST",
      headers: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/this Alphorn instance/i);
    }
  });

  it("allows a URL pointing at a different host", async () => {
    const { getChannel } = await import("@/channels");
    const handler = getChannel("webhook")!;
    const result = handler.configSchema.safeParse({
      url: "https://example.com/hook",
      method: "POST",
      headers: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects when port matches after default-port normalization", async () => {
    process.env.BETTER_AUTH_URL = "https://app.alphorn.dev";
    vi.resetModules();
    const { getChannel } = await import("@/channels");
    const handler = getChannel("webhook")!;
    const result = handler.configSchema.safeParse({
      url: "https://app.alphorn.dev:443/n/abc",
      method: "POST",
      headers: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("webhook channel send — outbound headers", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "https://app.alphorn.dev";
    process.env.BETTER_AUTH_SECRET = "test-secret";
    vi.resetModules();
  });

  it("user-supplied custom headers cannot override the loop-tracking trace header", async () => {
    const captured: Record<string, string>[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      captured.push(init.headers as Record<string, string>);
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getChannel } = await import("@/channels");
    const { verifyTrace } = await import("@/lib/webhook-loop/hops");
    const handler = getChannel("webhook")!;

    await handler.send(
      {
        url: "https://example.com/hook",
        method: "POST",
        headers: { "x-alphorn-trace": "attacker.forged" },
      },
      { title: null, message: "hi" },
      {
        channelId: "ch_1",
        deliveryId: "del_1",
        trace: ["pub_upstream"],
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const sent = captured[0];
    expect(verifyTrace(sent["x-alphorn-trace"])).toEqual(["pub_upstream"]);

    vi.unstubAllGlobals();
  });
});
