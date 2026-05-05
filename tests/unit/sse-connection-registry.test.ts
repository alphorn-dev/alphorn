import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addConnection,
  getConnectionCount,
  getIpConnectionCount,
  publish,
  removeConnection,
} from "@/lib/sse/connection-registry";

function makeWriter() {
  const chunks: string[] = [];
  return {
    write(chunk: string) {
      chunks.push(chunk);
    },
    close() {},
    chunks,
  };
}

let channelCounter = 0;
function uniqueChannel() {
  return `test-channel-${channelCounter++}-${Date.now()}`;
}

let ipCounter = 0;
function uniqueIp() {
  return `10.0.0.${ipCounter++}`;
}

describe("SSE connection registry", () => {
  beforeEach(() => {
    delete process.env.SSE_MAX_CONNECTIONS_PER_CHANNEL;
    delete process.env.SSE_MAX_CONNECTIONS_PER_IP;
  });

  afterEach(() => {
    delete process.env.SSE_MAX_CONNECTIONS_PER_CHANNEL;
    delete process.env.SSE_MAX_CONNECTIONS_PER_IP;
  });

  it("starts with 0 connections", () => {
    expect(getConnectionCount(uniqueChannel())).toBe(0);
  });

  it("addConnection increments count and returns ok", () => {
    const ch = uniqueChannel();
    expect(addConnection(ch, makeWriter(), uniqueIp())).toEqual({ ok: true });
    expect(getConnectionCount(ch)).toBe(1);
    expect(addConnection(ch, makeWriter(), uniqueIp())).toEqual({ ok: true });
    expect(getConnectionCount(ch)).toBe(2);
  });

  it("removeConnection decrements channel and ip counts", () => {
    const ch = uniqueChannel();
    const ip = uniqueIp();
    const w = makeWriter();
    addConnection(ch, w, ip);
    expect(getConnectionCount(ch)).toBe(1);
    expect(getIpConnectionCount(ip)).toBe(1);
    removeConnection(ch, w);
    expect(getConnectionCount(ch)).toBe(0);
    expect(getIpConnectionCount(ip)).toBe(0);
  });

  it("removeConnection is idempotent", () => {
    const ch = uniqueChannel();
    const w = makeWriter();
    addConnection(ch, w, uniqueIp());
    removeConnection(ch, w);
    removeConnection(ch, w);
    expect(getConnectionCount(ch)).toBe(0);
  });

  it("rejects when per-channel limit is exceeded", () => {
    process.env.SSE_MAX_CONNECTIONS_PER_CHANNEL = "2";
    const ch = uniqueChannel();
    expect(addConnection(ch, makeWriter(), uniqueIp()).ok).toBe(true);
    expect(addConnection(ch, makeWriter(), uniqueIp()).ok).toBe(true);
    const result = addConnection(ch, makeWriter(), uniqueIp());
    expect(result).toEqual({ ok: false, reason: "channel_full" });
    expect(getConnectionCount(ch)).toBe(2);
  });

  it("rejects when per-ip limit is exceeded across channels", () => {
    process.env.SSE_MAX_CONNECTIONS_PER_IP = "2";
    const ip = uniqueIp();
    expect(addConnection(uniqueChannel(), makeWriter(), ip).ok).toBe(true);
    expect(addConnection(uniqueChannel(), makeWriter(), ip).ok).toBe(true);
    const result = addConnection(uniqueChannel(), makeWriter(), ip);
    expect(result).toEqual({ ok: false, reason: "ip_full" });
  });

  it("frees ip slots after removeConnection", () => {
    process.env.SSE_MAX_CONNECTIONS_PER_IP = "1";
    const ip = uniqueIp();
    const ch = uniqueChannel();
    const w = makeWriter();
    expect(addConnection(ch, w, ip).ok).toBe(true);
    expect(addConnection(uniqueChannel(), makeWriter(), ip).ok).toBe(false);
    removeConnection(ch, w);
    expect(addConnection(uniqueChannel(), makeWriter(), ip).ok).toBe(true);
  });

  it("publish sends to all connections", () => {
    const ch = uniqueChannel();
    const w1 = makeWriter();
    const w2 = makeWriter();
    addConnection(ch, w1, uniqueIp());
    addConnection(ch, w2, uniqueIp());
    const sent = publish(ch, "data: hello\n\n");
    expect(sent).toBe(2);
    expect(w1.chunks).toEqual(["data: hello\n\n"]);
    expect(w2.chunks).toEqual(["data: hello\n\n"]);
  });

  it("publish returns 0 for unknown channel", () => {
    expect(publish(uniqueChannel(), "data: x\n\n")).toBe(0);
  });

  it("publish removes writers that throw and decrements ip count", () => {
    const ch = uniqueChannel();
    const brokenIp = uniqueIp();
    const broken = {
      write() {
        throw new Error("disconnected");
      },
      close() {},
    };
    const good = makeWriter();
    addConnection(ch, broken, brokenIp);
    addConnection(ch, good, uniqueIp());
    const sent = publish(ch, "data: test\n\n");
    expect(sent).toBe(1);
    expect(good.chunks).toEqual(["data: test\n\n"]);
    expect(getConnectionCount(ch)).toBe(1);
    expect(getIpConnectionCount(brokenIp)).toBe(0);
  });

  it("publish deletes the channel entry when all writers fail", () => {
    const ch = uniqueChannel();
    addConnection(
      ch,
      {
        write() {
          throw new Error("gone");
        },
        close() {},
      },
      uniqueIp(),
    );

    expect(publish(ch, "data: gone\n\n")).toBe(0);
    expect(getConnectionCount(ch)).toBe(0);
  });
});
