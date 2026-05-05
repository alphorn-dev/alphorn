import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AddConnectionResult } from "@/lib/sse/connection-registry";

const mocks = vi.hoisted(() => ({
  findChannel: vi.fn(),
  addConnection: vi.fn<(...args: unknown[]) => AddConnectionResult>(() => ({
    ok: true,
  })),
  removeConnection: vi.fn(),
  formatSseComment: vi.fn((text: string) => `:${text}\n\n`),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    channel: {
      findUnique: mocks.findChannel,
    },
  },
}));

vi.mock("@/lib/sse/connection-registry", () => ({
  addConnection: mocks.addConnection,
  removeConnection: mocks.removeConnection,
}));

vi.mock("@/lib/sse/format", () => ({
  formatSseComment: mocks.formatSseComment,
}));

describe("GET /api/stream/:publicId — SSE streaming", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.findChannel.mockReset();
    mocks.addConnection.mockReset();
    mocks.addConnection.mockReturnValue({ ok: true });
    mocks.removeConnection.mockReset();
    mocks.formatSseComment.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 for unknown channels", async () => {
    mocks.findChannel.mockResolvedValue(null);

    const { GET } = await import("@/app/api/stream/[publicId]/route");
    const res = await GET(
      new NextRequest("https://notifex.test/api/stream/missing"),
      { params: Promise.resolve({ publicId: "missing" }) }
    );

    expect(res.status).toBe(404);
    await expect(res.text()).resolves.toBe("Not found");
  });

  it("returns 404 for disabled or non-sse channels", async () => {
    mocks.findChannel.mockResolvedValue({
      id: "ch_1",
      type: "slack",
      enabled: true,
    });

    const { GET } = await import("@/app/api/stream/[publicId]/route");
    const res = await GET(
      new NextRequest("https://notifex.test/api/stream/not-sse"),
      { params: Promise.resolve({ publicId: "not-sse" }) }
    );

    expect(res.status).toBe(404);
  });

  it("opens an event stream, registers the connection, sends keepalives, and cleans up on abort", async () => {
    mocks.findChannel.mockResolvedValue({
      id: "channel-123",
      type: "sse",
      enabled: true,
    });

    const controller = new AbortController();
    const { GET } = await import("@/app/api/stream/[publicId]/route");

    const res = await GET(
      new NextRequest("https://notifex.test/api/stream/live", {
        signal: controller.signal,
      }),
      { params: Promise.resolve({ publicId: "live" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(mocks.addConnection).toHaveBeenCalledOnce();
    expect(mocks.formatSseComment).toHaveBeenCalledWith("connected");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: expect.any(Uint8Array),
    });

    vi.advanceTimersByTime(30_000);

    const keepaliveChunk = await reader.read();
    expect(decoder.decode(keepaliveChunk.value)).toBe(":keepalive\n\n");
    expect(mocks.formatSseComment).toHaveBeenCalledWith("keepalive");

    const writer = mocks.addConnection.mock.calls[0][1];
    controller.abort();
    await vi.runAllTimersAsync();

    expect(mocks.removeConnection).toHaveBeenCalledWith("channel-123", writer);
  });

  it("returns 429 when the connection registry rejects due to limits", async () => {
    mocks.findChannel.mockResolvedValue({
      id: "ch_full",
      type: "sse",
      enabled: true,
    });
    mocks.addConnection.mockReturnValueOnce({ ok: false, reason: "channel_full" });

    const { GET } = await import("@/app/api/stream/[publicId]/route");
    const res = await GET(
      new NextRequest("https://notifex.test/api/stream/full", {
        headers: { "x-forwarded-for": "203.0.113.5" },
      }),
      { params: Promise.resolve({ publicId: "full" }) }
    );

    expect(res.status).toBe(429);
    expect(mocks.addConnection).toHaveBeenCalledWith(
      "ch_full",
      expect.anything(),
      "203.0.113.5",
    );
  });

  it("removes the connection when keepalive writes fail", async () => {
    const realTransformStream = globalThis.TransformStream;
    const write = vi.fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("socket closed");
      });
    const close = vi.fn();

    vi.stubGlobal("TransformStream", class MockTransformStream {
      readable = new ReadableStream();
      writable = {
        getWriter() {
          return { write, close };
        },
      };
    });

    mocks.findChannel.mockResolvedValue({
      id: "channel-456",
      type: "sse",
      enabled: true,
    });

    const { GET } = await import("@/app/api/stream/[publicId]/route");
    await GET(
      new NextRequest("https://notifex.test/api/stream/live"),
      { params: Promise.resolve({ publicId: "live" }) }
    );

    const writer = mocks.addConnection.mock.calls.at(-1)![1];
    vi.advanceTimersByTime(30_000);

    expect(mocks.removeConnection).toHaveBeenCalledWith("channel-456", writer);
    expect(close).toHaveBeenCalled();

    vi.unstubAllGlobals();
    globalThis.TransformStream = realTransformStream;
  });
});
