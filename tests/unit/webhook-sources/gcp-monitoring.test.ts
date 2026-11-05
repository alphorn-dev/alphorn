import { describe, it, expect } from "vitest";
import { gcpMonitoringSource } from "@/lib/webhook-extract/sources/gcp-monitoring";

const incident = (overrides: Record<string, unknown> = {}) => ({
  version: "1.2",
  incident: {
    incident_id: "0.abc123",
    scoping_project_id: "alice-project",
    scoping_project_number: 123456789,
    url: "https://console.cloud.google.com/monitoring/alerting/incidents/0.abc123",
    started_at: 1700000000,
    ended_at: null,
    state: "open",
    summary: "CPU usage above 90% for api-server",
    observed_value: "0.95",
    resource: { type: "gce_instance", labels: { instance_id: "1111", zone: "us-central1-a" } },
    resource_type_display_name: "VM Instance",
    resource_id: "1111",
    resource_display_name: "api-server",
    resource_name: "projects/123456789/instances/1111",
    metric: { type: "compute.googleapis.com/instance/cpu/utilization", displayName: "CPU utilization", labels: {} },
    metadata: { system_labels: {}, user_labels: {} },
    policy_name: "High CPU",
    policy_user_labels: {},
    condition_name: "CPU above 90%",
    severity: "CRITICAL",
    threshold_value: "0.9",
    ...overrides,
  },
});

describe("gcpMonitoringSource", () => {
  it("formats an open incident with policy severity CRITICAL as priority 5", () => {
    expect(gcpMonitoringSource.extract(incident(), {})).toEqual({
      title: "[High CPU] CPU usage above 90% for api-server",
      message: [
        "Resource: api-server",
        "Condition: CPU above 90%",
        "Observed: 0.95 (threshold 0.9)",
        "https://console.cloud.google.com/monitoring/alerting/incidents/0.abc123",
      ].join("\n"),
      priority: 5,
      tags: ["gcp-monitoring", "open", "critical", "alice-project"],
    });
  });

  it("maps ERROR to 4 and WARNING to 3 for open incidents", () => {
    const error = incident({ severity: "ERROR" });
    const warning = incident({ severity: "WARNING" });
    expect(gcpMonitoringSource.extract(error, {}).priority).toBe(4);
    expect(gcpMonitoringSource.extract(warning, {}).priority).toBe(3);
  });

  it("defaults open incidents without severity to priority 4", () => {
    const body = incident({ severity: "" });
    expect(gcpMonitoringSource.extract(body, {})).toMatchObject({
      priority: 4,
      tags: ["gcp-monitoring", "open", "alice-project"],
    });
  });

  it("formats a closed incident as a resolved recovery with priority 2", () => {
    const body = incident({ state: "closed", ended_at: 1700000600 });
    expect(gcpMonitoringSource.extract(body, {})).toMatchObject({
      title: "[High CPU] resolved: CPU usage above 90% for api-server",
      priority: 2,
      tags: ["gcp-monitoring", "closed", "critical", "alice-project"],
    });
  });

  it("detects Google Cloud Monitoring payloads by shape", () => {
    expect(gcpMonitoringSource.detect(incident(), {})).toBe(true);
    expect(gcpMonitoringSource.detect(incident({ state: "closed" }), {})).toBe(true);
  });

  it("does not detect generic or other-vendor payloads", () => {
    expect(gcpMonitoringSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      gcpMonitoringSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    const malformed = { version: 1.2, incident: { state: 7, summary: ["x"], policy_name: null } };
    expect(() => gcpMonitoringSource.extract(malformed, {})).not.toThrow();
    expect(gcpMonitoringSource.extract(malformed, {})).toEqual({
      title: "incident",
      message: "",
      priority: null,
      tags: ["gcp-monitoring"],
    });
  });
});
