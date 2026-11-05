import { describe, it, expect } from "vitest";
import { pagerdutySource } from "@/lib/webhook-extract/sources/pagerduty";

const incidentEvent = (eventType: string, data: Record<string, unknown> = {}) => ({
  event: {
    id: "abc123",
    event_type: eventType,
    resource_type: "incident",
    occurred_at: "2026-01-01T12:00:00Z",
    agent: { type: "user_reference", summary: "alice" },
    client: null,
    data: {
      id: "P2XYZ12",
      type: "incident",
      number: 42,
      title: "Database unreachable",
      status: "triggered",
      urgency: "high",
      priority: { id: "P3", type: "priority_reference", summary: "P1" },
      service: { id: "PSVC1", type: "service_reference", summary: "Payments API" },
      assignees: [{ type: "user_reference", summary: "bob" }],
      html_url: "https://example.com/incidents/abc123",
      ...data,
    },
  },
});

describe("pagerdutySource", () => {
  it("formats a triggered P1 incident as priority 5", () => {
    const body = incidentEvent("incident.triggered");
    expect(pagerdutySource.detect(body, {})).toBe(true);
    expect(pagerdutySource.extract(body, {})).toEqual({
      title: "[Payments API] Incident #42 triggered: Database unreachable",
      message: [
        "Service: Payments API",
        "Priority: P1",
        "Urgency: high",
        "Assignees: bob",
        "By: alice",
        "https://example.com/incidents/abc123",
      ].join("\n"),
      priority: 5,
      tags: ["pagerduty", "incident.triggered", "triggered", "payments api"],
    });
  });

  it("gives a triggered incident priority 4 when not urgent", () => {
    const body = incidentEvent("incident.triggered", {
      urgency: "low",
      priority: { summary: "P3" },
    });
    expect(pagerdutySource.extract(body, {}).priority).toBe(4);
  });

  it("marks resolved incidents as priority 2", () => {
    const result = pagerdutySource.extract(
      incidentEvent("incident.resolved", { status: "resolved" }),
      {}
    );
    expect(result.title).toBe("[Payments API] Incident #42 resolved: Database unreachable");
    expect(result.priority).toBe(2);
    expect(result.tags).toContain("resolved");
  });

  it("treats acknowledged incidents as informational", () => {
    const result = pagerdutySource.extract(
      incidentEvent("incident.acknowledged", { status: "acknowledged" }),
      {}
    );
    expect(result.title).toBe("[Payments API] Incident #42 acknowledged: Database unreachable");
    expect(result.priority).toBeNull();
  });

  it("formats service events without a priority", () => {
    const body = {
      event: {
        event_type: "service.updated",
        resource_type: "service",
        data: { type: "service", name: "Payments API", html_url: "https://example.com/services/PSVC1" },
      },
    };
    expect(pagerdutySource.detect(body, {})).toBe(true);
    expect(pagerdutySource.extract(body, {})).toMatchObject({
      title: "PagerDuty: service updated: Payments API",
      priority: null,
      tags: ["pagerduty", "service.updated"],
    });
  });

  it("uses a generic title for unknown event types", () => {
    const body = { event: { event_type: "scribe.summary.created", resource_type: "scribe", data: {} } };
    expect(pagerdutySource.extract(body, { "x-pagerduty-signature": "v1=abc" })).toMatchObject({
      title: "PagerDuty: scribe summary created",
      priority: null,
    });
  });

  it("detects by signature header", () => {
    expect(pagerdutySource.detect({}, { "x-pagerduty-signature": "v1=abc" })).toBe(true);
  });

  it("does not match generic or GitHub-like payloads", () => {
    expect(pagerdutySource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      pagerdutySource.detect({ action: "opened", repository: { full_name: "example/app" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    const body = {
      event: {
        event_type: "incident.triggered",
        resource_type: "incident",
        data: { number: "x", priority: "P1", assignees: [null, 5], service: 3 },
      },
    };
    expect(() => pagerdutySource.extract(body, {})).not.toThrow();
    expect(pagerdutySource.extract(body, {}).title).toBe("Incident triggered");
  });
});
