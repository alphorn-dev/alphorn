import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "@/channels/smtp";
import { getChannel } from "@/channels/registry";

// A real HTTP CONNECT proxy that records the tunnel target and refuses it, like
// smokescreen does for internal addresses. Proves SMTP doesn't bypass the proxy.
let proxy: Server;
const tunnels: string[] = [];

beforeAll(async () => {
  proxy = createServer();
  proxy.on("connect", (req, socket) => {
    tunnels.push(req.url ?? "");
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  process.env.EGRESS_PROXY_URL = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});

afterAll(() => {
  delete process.env.EGRESS_PROXY_URL;
  proxy.close();
});

describe("smtp channel egress", () => {
  it("tunnels the SMTP connection through EGRESS_PROXY_URL", async () => {
    const handler = getChannel("smtp")!;
    const config = handler.configSchema.parse({
      host: "10.0.0.5",
      port: 587,
      username: "u",
      password: "p",
      from: "alerts@example.com",
      to: "ops@example.com",
    });

    await expect(handler.send(config, { title: "t", message: "m" }, { channelId: "c", deliveryId: "d", trace: [] })).rejects.toThrow();
    expect(tunnels).toEqual(["10.0.0.5:587"]);
  });
});
