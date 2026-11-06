import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/channels/sse";
import { getChannel } from "@/channels/registry";
import { PermanentChannelError } from "@/channels/errors";

const handler = getChannel("sse")!;
const config = {
  format: "json",
  includePriority: true,
  includeTags: true,
  includePayload: true,
};

function send() {
  return handler.send(
    config,
    { title: "t", message: "m" },
    { channelId: "c", channelPublicId: "pub_c", deliveryId: "d" }
  );
}

describe("sse channel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("throws PermanentChannelError when SSE_MODE=standalone without SSE_SERVER_URL", async () => {
    vi.stubEnv("SSE_MODE", "standalone");
    vi.stubEnv("SSE_SERVER_URL", "");
    await expect(send()).rejects.toBeInstanceOf(PermanentChannelError);
  });

  it("throws PermanentChannelError when SSE_MODE=standalone without SSE_INTERNAL_SECRET", async () => {
    vi.stubEnv("SSE_MODE", "standalone");
    vi.stubEnv("SSE_SERVER_URL", "http://sse:4000");
    vi.stubEnv("SSE_INTERNAL_SECRET", "");
    await expect(send()).rejects.toBeInstanceOf(PermanentChannelError);
  });

  it("throws PermanentChannelError in a standalone worker without the SSE server", async () => {
    vi.stubEnv("SSE_MODE", "");
    vi.stubEnv("MODE", "worker");
    await expect(send()).rejects.toBeInstanceOf(PermanentChannelError);
  });

  it("POSTs to the SSE server in standalone mode", async () => {
    vi.stubEnv("SSE_MODE", "standalone");
    vi.stubEnv("SSE_SERVER_URL", "http://sse:4000");
    vi.stubEnv("SSE_INTERNAL_SECRET", "secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await send();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("http://sse:4000/publish/pub_c");
  });

  it("publishes locally in embedded mode (MODE=all)", async () => {
    vi.stubEnv("SSE_MODE", "");
    vi.stubEnv("MODE", "all");
    await expect(send()).resolves.toBeUndefined();
  });

  it("only reaches streams opened with the current publicId (rotation cuts old ones off)", async () => {
    vi.stubEnv("SSE_MODE", "");
    vi.stubEnv("MODE", "all");
    const { addConnection, removeConnection } = await import("@/lib/sse/connection-registry");
    const current = { write: vi.fn(), close: vi.fn() };
    const rotatedAway = { write: vi.fn(), close: vi.fn() };
    addConnection("pub_c", current, "203.0.113.10");
    addConnection("pub_old", rotatedAway, "203.0.113.11");

    await send();

    expect(current.write).toHaveBeenCalledOnce();
    expect(rotatedAway.write).not.toHaveBeenCalled();
    removeConnection("pub_c", current);
    removeConnection("pub_old", rotatedAway);
  });
});
