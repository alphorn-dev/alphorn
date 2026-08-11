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
    { channelId: "c", deliveryId: "d" }
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

  it("throws PermanentChannelError in a standalone worker without the SSE server", async () => {
    vi.stubEnv("SSE_MODE", "");
    vi.stubEnv("MODE", "worker");
    await expect(send()).rejects.toBeInstanceOf(PermanentChannelError);
  });

  it("POSTs to the SSE server in standalone mode", async () => {
    vi.stubEnv("SSE_MODE", "standalone");
    vi.stubEnv("SSE_SERVER_URL", "http://sse:4000");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await send();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("http://sse:4000/publish/c");
  });

  it("publishes locally in embedded mode (MODE=all)", async () => {
    vi.stubEnv("SSE_MODE", "");
    vi.stubEnv("MODE", "all");
    await expect(send()).resolves.toBeUndefined();
  });
});
