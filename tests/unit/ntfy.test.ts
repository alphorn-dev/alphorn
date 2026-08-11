import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/channels/ntfy";
import { getChannel } from "@/channels/registry";

const handler = getChannel("ntfy")!;
const config = { serverUrl: "https://ntfy.sh", topic: "alerts" };

function mockFetch(status: number, body = "{}") {
  return vi.fn().mockResolvedValue(
    new Response(body, { status })
  );
}

function sentHeaders(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls[0][1].headers as Record<string, string>;
}

describe("ntfy channel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends an ASCII title verbatim", async () => {
    const fetchMock = mockFetch(200);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(
      config,
      { title: "Hello", message: "m" },
      { channelId: "c", deliveryId: "d" }
    );

    expect(sentHeaders(fetchMock)["X-Title"]).toBe("Hello");
  });

  it("strips CR/LF from the title", async () => {
    const fetchMock = mockFetch(200);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(
      config,
      { title: "a\r\nb", message: "m" },
      { channelId: "c", deliveryId: "d" }
    );

    expect(sentHeaders(fetchMock)["X-Title"]).toBe("ab");
  });

  it("RFC 2047 encodes a non-ASCII title", async () => {
    const fetchMock = mockFetch(200);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(
      config,
      { title: "Grüße 🚨", message: "m" },
      { channelId: "c", deliveryId: "d" }
    );

    const expected = `=?UTF-8?B?${Buffer.from("Grüße 🚨", "utf8").toString("base64")}?=`;
    expect(sentHeaders(fetchMock)["X-Title"]).toBe(expected);
  });

  it("sends ASCII tags comma-joined and encodes non-ASCII tags", async () => {
    let fetchMock = mockFetch(200);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(
      config,
      { title: null, message: "m", tags: ["warn\r\ning", "ok"] },
      { channelId: "c", deliveryId: "d" }
    );
    expect(sentHeaders(fetchMock)["X-Tags"]).toBe("warning,ok");

    fetchMock = mockFetch(200);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(
      config,
      { title: null, message: "m", tags: ["ok", "grüß"] },
      { channelId: "c", deliveryId: "d" }
    );
    const expected = `=?UTF-8?B?${Buffer.from("ok,grüß", "utf8").toString("base64")}?=`;
    expect(sentHeaders(fetchMock)["X-Tags"]).toBe(expected);
  });
});
