import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/channels/gotify";
import { getChannel } from "@/channels/registry";

const handler = getChannel("gotify")!;
const config = { serverUrl: "https://gotify.example.com", appToken: "tok" };

function mockFetch(status: number, body = "{}") {
  return vi.fn().mockResolvedValue(
    new Response(body, { status })
  );
}

async function sentPriority(priority?: number) {
  const fetchMock = mockFetch(200);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await handler.send(
    config,
    { title: "t", message: "m", ...(priority != null ? { priority } : {}) },
    { channelId: "c", deliveryId: "d" }
  );
  return JSON.parse(fetchMock.mock.calls[0][1].body).priority;
}

describe("gotify channel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps the 1-5 priority scale onto Gotify's 0-10 scale", async () => {
    expect(await sentPriority(1)).toBe(1);
    expect(await sentPriority(2)).toBe(3);
    expect(await sentPriority(3)).toBe(5);
    expect(await sentPriority(4)).toBe(8);
    expect(await sentPriority(5)).toBe(10);
  });

  it("defaults to 5 when priority is missing", async () => {
    expect(await sentPriority()).toBe(5);
  });
});
