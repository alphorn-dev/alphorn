import { describe, it, expect } from "vitest";
import { cloudflareSource } from "@/lib/webhook-extract/sources/cloudflare";

// Shape from the "Origin health check" example in the Cloudflare payload schema docs.
const notification = (overrides: Record<string, unknown>) => ({
  account_id: "9035f53656c247e895c5a6939ae8a0e0",
  alert_correlation_id: "000eaa907ed24e78946d3a93adb2ae57",
  alert_event: "ALERT_STATE_EVENT_START",
  alert_type: "health_check_status_notification",
  data: { health_check_name: "api", new_status: "Unhealthy", zone_name: "example.com" },
  name: "Origin health",
  policy_id: "749b911ea5d04344a58e45edd099b328",
  policy_name: "Origin health",
  text: "Health check api for example.com is now Unhealthy.",
  ts: 1794650100,
  ...overrides,
});

describe("cloudflareSource", () => {
  it("formats a starting alert as high priority", () => {
    const body = notification({});
    expect(cloudflareSource.detect(body, {})).toBe(true);
    expect(cloudflareSource.extract(body, {})).toEqual({
      title: "Origin health",
      message: "Health check api for example.com is now Unhealthy.",
      priority: 4,
      tags: ["cloudflare", "health_check_status_notification", "started"],
    });
  });

  it("formats an ending alert as resolved", () => {
    const body = notification({ alert_event: "ALERT_STATE_EVENT_END" });
    expect(cloudflareSource.extract(body, {})).toEqual({
      title: "Resolved: Origin health",
      message: "Health check api for example.com is now Unhealthy.",
      priority: 2,
      tags: ["cloudflare", "health_check_status_notification", "resolved"],
    });
  });

  it("handles notifications without the optional fields", () => {
    const body = { policy_name: "Billing", text: "Usage threshold exceeded.", ts: 1794650100 };
    expect(cloudflareSource.detect(body, {})).toBe(true);
    expect(cloudflareSource.extract(body, {})).toEqual({
      title: "Billing",
      message: "Usage threshold exceeded.",
      priority: null,
      tags: ["cloudflare"],
    });
  });

  it("does not claim generic text payloads", () => {
    expect(cloudflareSource.detect({ text: "hello", ts: 1794650100 }, {})).toBe(false);
    expect(cloudflareSource.detect({ text: "hello", ts: "1794650100", policy_id: "p" }, {})).toBe(false);
  });
});
