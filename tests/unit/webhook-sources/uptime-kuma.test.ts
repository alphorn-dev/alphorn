import { describe, it, expect } from "vitest";
import { uptimeKumaSource } from "@/lib/webhook-extract/sources/uptime-kuma";

const monitor = {
  id: 7,
  name: "my-api",
  url: "https://api.example.com/health",
  hostname: null,
  type: "http",
  active: true,
  tags: [],
};

const heartbeat = (status: number, extra: Record<string, unknown> = {}) => ({
  monitorID: 7,
  status,
  time: "2026-11-05 10:15:00.000",
  msg: "502 Bad Gateway",
  ping: null,
  important: true,
  duration: 0,
  retries: 0,
  response: null,
  ...extra,
});

const payload = (status: number, extra: Record<string, unknown> = {}) => ({
  heartbeat: heartbeat(status, extra),
  monitor,
  msg: `[my-api] [🔴 Down] 502 Bad Gateway`,
});

describe("uptimeKumaSource", () => {
  it("formats a down heartbeat as high priority", () => {
    expect(uptimeKumaSource.detect(payload(0), {})).toBe(true);
    expect(uptimeKumaSource.extract(payload(0), {})).toEqual({
      title: "my-api is DOWN",
      message:
        "[my-api] [🔴 Down] 502 Bad Gateway\nhttps://api.example.com/health\nTime: 2026-11-05 10:15:00.000 UTC",
      priority: 4,
      tags: ["uptime-kuma", "down", "http", "my-api"],
    });
  });

  it("formats an up heartbeat with the previous down time", () => {
    const body = payload(1, { msg: "200 - OK", lastDownTime: "2026-11-05 10:00:00.000" });
    body.msg = "[my-api] [✅ Up] 200 - OK";
    expect(uptimeKumaSource.detect(body, {})).toBe(true);
    expect(uptimeKumaSource.extract(body, {})).toEqual({
      title: "my-api is UP",
      message:
        "[my-api] [✅ Up] 200 - OK\nhttps://api.example.com/health\nTime: 2026-11-05 10:15:00.000 UTC\nDown since: 2026-11-05 10:00:00.000 UTC",
      priority: 2,
      tags: ["uptime-kuma", "up", "http", "my-api"],
    });
  });

  it("formats pending and maintenance without priority", () => {
    expect(uptimeKumaSource.extract(payload(2), {})).toMatchObject({
      title: "my-api is PENDING",
      priority: null,
      tags: ["uptime-kuma", "pending", "http", "my-api"],
    });
    expect(uptimeKumaSource.extract(payload(3), {})).toMatchObject({
      title: "my-api is IN MAINTENANCE",
      priority: null,
      tags: ["uptime-kuma", "maintenance", "http", "my-api"],
    });
  });

  it("uses the hostname for monitors without a URL", () => {
    const body = { ...payload(0), monitor: { ...monitor, url: null, hostname: "db.example.com", type: "ping" } };
    expect(uptimeKumaSource.extract(body, {}).message).toContain("db.example.com");
  });

  it("handles the test notification (no monitor or heartbeat)", () => {
    const body = { heartbeat: null, monitor: null, msg: "Testing Notification" };
    expect(uptimeKumaSource.detect(body, {})).toBe(true);
    expect(uptimeKumaSource.extract(body, {})).toEqual({
      title: "Uptime Kuma test notification",
      message: "Testing Notification",
      priority: null,
      tags: ["uptime-kuma", "test"],
    });
  });

  it("falls back to a generic title for unknown status codes", () => {
    const result = uptimeKumaSource.extract(payload(9), {});
    expect(result.title).toBe("my-api: status update");
    expect(result.priority).toBeNull();
    expect(result.tags).not.toContain("undefined");
  });

  it("does not match generic or other vendor payloads", () => {
    expect(uptimeKumaSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      uptimeKumaSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    expect(() => uptimeKumaSource.extract({ heartbeat: "x", monitor: [], msg: 42 }, {})).not.toThrow();
    expect(uptimeKumaSource.extract({ heartbeat: "x", monitor: [], msg: 42 }, {})).toEqual({
      title: "Monitor: status update",
      message: "",
      priority: null,
      tags: ["uptime-kuma"],
    });
    expect(() => uptimeKumaSource.extract({ heartbeat: { status: "0" }, monitor: { name: 5 }, msg: null }, {})).not.toThrow();
  });
});
