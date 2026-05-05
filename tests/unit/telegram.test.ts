import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/channels/telegram";
import { getChannel } from "@/channels/registry";
import { PermanentChannelError } from "@/channels/errors";

const handler = getChannel("telegram")!;
const config = { botToken: "token", chatId: "123" };

function mockFetch(status: number, body = "{}") {
  return vi.fn().mockResolvedValue(
    new Response(body, { status })
  );
}

describe("telegram channel", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends title and message in HTML", async () => {
    const fetchMock = mockFetch(200);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await handler.send(
      config,
      { title: "Hi", message: "There <script>" },
      { channelId: "c", deliveryId: "d" }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toBe("<b>Hi</b>\nThere &lt;script&gt;");
    expect(body.parse_mode).toBe("HTML");
  });

  it("truncates messages longer than 4096 chars", async () => {
    const fetchMock = mockFetch(200);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const longMessage = "a".repeat(10_000);
    await handler.send(
      config,
      { title: "T", message: longMessage },
      { channelId: "c", deliveryId: "d" }
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text.length).toBeLessThanOrEqual(4096);
    expect(body.text).toMatch(/\[truncated\]$/);
    expect(body.text.startsWith("<b>T</b>\n")).toBe(true);
  });

  it("throws PermanentChannelError on 400", async () => {
    globalThis.fetch = mockFetch(
      400,
      '{"ok":false,"error_code":400,"description":"Bad Request: message is too long"}'
    ) as unknown as typeof fetch;

    await expect(
      handler.send(
        config,
        { title: "t", message: "m" },
        { channelId: "c", deliveryId: "d" }
      )
    ).rejects.toBeInstanceOf(PermanentChannelError);
  });

  it("throws PermanentChannelError on 401/403/404", async () => {
    for (const status of [401, 403, 404]) {
      globalThis.fetch = mockFetch(status) as unknown as typeof fetch;
      await expect(
        handler.send(
          config,
          { title: "t", message: "m" },
          { channelId: "c", deliveryId: "d" }
        )
      ).rejects.toBeInstanceOf(PermanentChannelError);
    }
  });

  it("throws a regular Error on 429 (transient)", async () => {
    globalThis.fetch = mockFetch(429) as unknown as typeof fetch;
    await expect(
      handler.send(
        config,
        { title: "t", message: "m" },
        { channelId: "c", deliveryId: "d" }
      )
    ).rejects.toThrowError(
      expect.not.objectContaining({ name: "PermanentChannelError" })
    );
  });

  it("throws a regular Error on 500 (transient)", async () => {
    globalThis.fetch = mockFetch(500) as unknown as typeof fetch;
    const promise = handler.send(
      config,
      { title: "t", message: "m" },
      { channelId: "c", deliveryId: "d" }
    );
    await expect(promise).rejects.toThrow(/500/);
    await expect(promise).rejects.not.toBeInstanceOf(PermanentChannelError);
  });
});
