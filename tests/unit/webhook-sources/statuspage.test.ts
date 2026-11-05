import { describe, it, expect } from "vitest";
import { statuspageSource } from "@/lib/webhook-extract/sources/statuspage";

const page = { id: "abc123", status_indicator: "major", status_description: "Partial System Outage" };
const meta = {
  unsubscribe: "https://www.example.com/unsubscribe/abc123",
  documentation: "http://doers.statuspage.io/customer-notifications/webhooks/",
};

const incidentPayload = (status: string, impact: string, body: string) => ({
  meta,
  page,
  incident: {
    id: "inc123",
    name: "API elevated error rates",
    status,
    impact,
    shortlink: "http://stspg.io/xyz",
    incident_updates: [{ id: "upd1", status, body, created_at: "2026-01-01T10:00:00Z" }],
  },
});

const componentPayload = (oldStatus: string, newStatus: string) => ({
  meta,
  page,
  component_update: {
    id: "cu1",
    component_id: "comp1",
    old_status: oldStatus,
    new_status: newStatus,
    created_at: "2026-01-01T10:00:00Z",
  },
  component: { id: "comp1", name: "Database", status: newStatus },
});

describe("statuspageSource", () => {
  it("formats an investigating critical incident", () => {
    const body = incidentPayload("investigating", "critical", "We are looking into elevated errors.");
    expect(statuspageSource.detect(body, {})).toBe(true);
    expect(statuspageSource.extract(body, {})).toEqual({
      title: "API elevated error rates: investigating",
      message: "We are looking into elevated errors.\nhttp://stspg.io/xyz",
      priority: 5,
      tags: ["statuspage", "incident", "investigating", "critical"],
    });
  });

  it("maps major and minor impact to priority 4 and 3", () => {
    expect(statuspageSource.extract(incidentPayload("identified", "major", "x"), {}).priority).toBe(4);
    expect(statuspageSource.extract(incidentPayload("monitoring", "minor", "x"), {}).priority).toBe(3);
  });

  it("marks a resolved incident as recovered (priority 2)", () => {
    const result = statuspageSource.extract(incidentPayload("resolved", "critical", "Fixed."), {});
    expect(result.title).toBe("API elevated error rates: resolved");
    expect(result.message).toBe("Fixed.\nhttp://stspg.io/xyz");
    expect(result.priority).toBe(2);
  });

  it("formats a component status change", () => {
    const body = componentPayload("operational", "major_outage");
    expect(statuspageSource.detect(body, {})).toBe(true);
    expect(statuspageSource.extract(body, {})).toEqual({
      title: "Database: operational -> major_outage",
      message: "Partial System Outage",
      priority: 5,
      tags: ["statuspage", "component_update", "major_outage"],
    });
  });

  it("maps component statuses to priorities", () => {
    expect(statuspageSource.extract(componentPayload("major_outage", "partial_outage"), {}).priority).toBe(4);
    expect(statuspageSource.extract(componentPayload("partial_outage", "degraded_performance"), {}).priority).toBe(3);
    expect(statuspageSource.extract(componentPayload("major_outage", "operational"), {}).priority).toBe(2);
    expect(statuspageSource.extract(componentPayload("operational", "under_maintenance"), {}).priority).toBeNull();
  });

  it("does not detect generic or other-vendor payloads", () => {
    expect(statuspageSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      statuspageSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    const malformed = [
      { meta: { unsubscribe: 42 }, page: { id: null }, incident: "oops" },
      { meta, page, incident: { incident_updates: "nope", name: 7, status: null } },
      { meta, page, component_update: { new_status: ["x"] }, component: 5 },
      { meta, page, incident: { incident_updates: [null, 3] } },
    ];
    for (const body of malformed) {
      expect(() => statuspageSource.extract(body as never, {})).not.toThrow();
    }
    const result = statuspageSource.extract(
      { meta, page, incident: { incident_updates: [null] } },
      {}
    );
    expect(result.title).toBe("Incident: updated");
    expect(result.message).toBe("");
  });
});
