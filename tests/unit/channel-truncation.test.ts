import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/channels/google-chat";
import "@/channels/opsgenie";
import "@/channels/matrix";
import "@/channels/sendgrid";
import { getChannel } from "@/channels/registry";

function mockFetch(status = 200, body = "{}") {
  return vi.fn().mockResolvedValue(new Response(body, { status }));
}

function sentBody(fetchMock: ReturnType<typeof mockFetch>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("channel output truncation", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("google-chat truncates the text paragraph at 4096 chars", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getChannel("google-chat")!.send(
      { webhookUrl: "https://chat.googleapis.com/x" },
      { title: null, message: "a".repeat(5000) },
      { channelId: "c", deliveryId: "d" },
    );

    const text = sentBody(fetchMock).cards[0].sections[0].widgets[0].textParagraph.text;
    expect(text).toHaveLength(4096);
    expect(text.endsWith("…")).toBe(true);
  });

  it("opsgenie truncates message to 130 and description to 15000", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getChannel("opsgenie")!.send(
      { apiKey: "k", region: "us", priority: "P3" },
      { title: "a".repeat(300), message: "b".repeat(20000) },
      { channelId: "c", deliveryId: "d" },
    );

    const body = sentBody(fetchMock);
    expect(body.message).toHaveLength(130);
    expect(body.message.endsWith("…")).toBe(true);
    expect(body.description).toHaveLength(15000);
    expect(body.description.endsWith("…")).toBe(true);
  });

  it("matrix truncates the message body at 32768 chars", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getChannel("matrix")!.send(
      { homeserverUrl: "https://matrix.example.com", accessToken: "t", roomId: "!r:example.com" },
      { title: null, message: "a".repeat(40000) },
      { channelId: "c", deliveryId: "d" },
    );

    const body = sentBody(fetchMock).body;
    expect(body).toHaveLength(32768);
    expect(body.endsWith("…")).toBe(true);
  });

  it("sendgrid truncates the subject to 998 chars but leaves the body untouched", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const longMessage = "b".repeat(5000);
    await getChannel("sendgrid")!.send(
      { apiKey: "k", from: "from@example.com", to: "to@example.com" },
      { title: "a".repeat(2000), message: longMessage },
      { channelId: "c", deliveryId: "d" },
    );

    const body = sentBody(fetchMock);
    expect(body.subject).toHaveLength(998);
    expect(body.subject.endsWith("…")).toBe(true);
    expect(body.content[0].value).toBe(longMessage);
  });
});
