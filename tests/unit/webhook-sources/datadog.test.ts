import { describe, it, expect } from "vitest";
import { datadogSource } from "@/lib/webhook-extract/sources/datadog";

// Default payload of the Datadog Webhooks integration.
const event = (overrides: Record<string, unknown>) => ({
  id: "7654321098765432109",
  title: "[Triggered on {host:web-1}] High CPU",
  body: "%%%\nCPU is above 95% on web-1\n\n[Monitor Status](https://app.datadoghq.com/monitors/123)\n%%%",
  event_type: "query_alert_monitor",
  date: "1794650100000",
  last_updated: "1794650100000",
  org: { id: "12345", name: "Acme" },
  ...overrides,
});

describe("datadogSource", () => {
  it("formats a triggered monitor as high priority", () => {
    const body = event({});
    expect(datadogSource.detect(body, {})).toBe(true);
    expect(datadogSource.extract(body, {})).toEqual({
      title: "[Triggered on {host:web-1}] High CPU",
      message:
        "CPU is above 95% on web-1\n\n[Monitor Status](https://app.datadoghq.com/monitors/123)",
      priority: 4,
      tags: ["datadog", "query_alert_monitor", "triggered"],
    });
  });

  it.each([
    ["[Recovered] High CPU", 2, "recovered"],
    ["[Warn] High CPU", 3, "warn"],
    ["[No Data] High CPU", 4, "no-data"],
    ["[Re-Triggered] High CPU", 4, "triggered"],
  ])("maps the title prefix of %s", (title, priority, tag) => {
    const result = datadogSource.extract(event({ title }), {});
    expect(result.priority).toBe(priority);
    expect(result.tags).toEqual(["datadog", "query_alert_monitor", tag]);
  });

  it("leaves non-monitor events without priority", () => {
    const result = datadogSource.extract(
      event({ title: "Deploy finished", body: "v1.2.3 is live", event_type: "api" }),
      {}
    );
    expect(result).toEqual({
      title: "Deploy finished",
      message: "v1.2.3 is live",
      priority: null,
      tags: ["datadog", "api"],
    });
  });

  it("does not claim payloads without the Datadog envelope", () => {
    expect(datadogSource.detect({ title: "x", body: "y", event_type: "z" }, {})).toBe(false);
    expect(
      datadogSource.detect({ last_updated: "1", event_type: "z", org: "acme" }, {})
    ).toBe(false);
  });
});
