import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/channels/vonage-sms";
import { getChannel } from "@/channels/registry";
import { PermanentChannelError } from "@/channels/errors";

const handler = getChannel("vonage-sms")!;
const config = { apiKey: "k", apiSecret: "s", from: "Alphorn", to: "123" };

function mockFetch(status: string, errorText?: string) {
  const body = JSON.stringify({
    messages: [{ status, ...(errorText ? { "error-text": errorText } : {}) }],
  });
  return vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
}

function send() {
  return handler.send(
    config,
    { title: "t", message: "m" },
    { channelId: "c", deliveryId: "d" }
  );
}

describe("vonage-sms channel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves on status 0", async () => {
    globalThis.fetch = mockFetch("0") as unknown as typeof fetch;
    await expect(send()).resolves.toBeUndefined();
  });

  it("throws PermanentChannelError on statuses 2, 3, 4, 15", async () => {
    for (const status of ["2", "3", "4", "15"]) {
      globalThis.fetch = mockFetch(status, "bad config") as unknown as typeof fetch;
      await expect(send()).rejects.toBeInstanceOf(PermanentChannelError);
    }
  });

  it("throws a regular Error on status 1 (throttled)", async () => {
    globalThis.fetch = mockFetch("1", "Throttled") as unknown as typeof fetch;
    const promise = send();
    await expect(promise).rejects.toThrow(/Throttled/);
    await expect(promise).rejects.not.toBeInstanceOf(PermanentChannelError);
  });

  it("throws a regular Error on other non-zero statuses", async () => {
    globalThis.fetch = mockFetch("5") as unknown as typeof fetch;
    const promise = send();
    await expect(promise).rejects.toThrow(/Unknown error/);
    await expect(promise).rejects.not.toBeInstanceOf(PermanentChannelError);
  });
});
