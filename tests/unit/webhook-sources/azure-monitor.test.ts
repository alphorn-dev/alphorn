import { describe, it, expect } from "vitest";
import { azureMonitorSource } from "@/lib/webhook-extract/sources/azure-monitor";

const TARGET =
  "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-example/providers/Microsoft.Compute/virtualMachines/vm-web-01";

function alert(essentials: Record<string, unknown>) {
  return {
    schemaId: "azureMonitorCommonAlertSchema",
    data: {
      essentials: {
        alertId: "/subscriptions/0000/providers/Microsoft.AlertsManagement/alerts/abc123",
        alertRule: "high-cpu",
        severity: "Sev2",
        signalType: "Metric",
        monitorCondition: "Fired",
        monitoringService: "Platform",
        alertTargetIDs: [TARGET],
        firedDateTime: "2026-01-01T10:00:00.0000000Z",
        description: "CPU above 80% for 5 minutes",
        ...essentials,
      },
      alertContext: { conditionType: "SingleResourceMultipleMetricCriteria" },
    },
  };
}

describe("azureMonitorSource", () => {
  it("detects the common alert schema by schemaId", () => {
    expect(azureMonitorSource.detect(alert({}), {})).toBe(true);
  });

  it("does not detect generic or GitHub-like payloads", () => {
    expect(azureMonitorSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      azureMonitorSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("formats a fired alert", () => {
    expect(azureMonitorSource.extract(alert({}), {})).toEqual({
      title: "[Fired] high-cpu",
      message: [
        "CPU above 80% for 5 minutes",
        "Resource: vm-web-01",
        "Service: Platform",
      ].join("\n"),
      priority: 3,
      tags: ["azure-monitor", "fired", "sev2", "metric"],
    });
  });

  it("maps Sev0 to priority 5 and Sev1 to priority 4", () => {
    expect(azureMonitorSource.extract(alert({ severity: "Sev0" }), {}).priority).toBe(5);
    expect(azureMonitorSource.extract(alert({ severity: "Sev1" }), {}).priority).toBe(4);
  });

  it("leaves priority null for Sev3 and Sev4", () => {
    expect(azureMonitorSource.extract(alert({ severity: "Sev3" }), {}).priority).toBeNull();
    expect(azureMonitorSource.extract(alert({ severity: "Sev4" }), {}).priority).toBeNull();
  });

  it("formats a resolved alert with priority 2 regardless of severity", () => {
    const result = azureMonitorSource.extract(
      alert({ monitorCondition: "Resolved", severity: "Sev0" }),
      {}
    );
    expect(result.title).toBe("[Resolved] high-cpu");
    expect(result.priority).toBe(2);
    expect(result.tags).toContain("resolved");
  });

  it("handles a log alert with no target and no description", () => {
    const result = azureMonitorSource.extract(
      alert({
        signalType: "Log",
        monitoringService: "Log Alerts V2",
        alertTargetIDs: [],
        description: "",
      }),
      {}
    );
    expect(result).toEqual({
      title: "[Fired] high-cpu",
      message: "Service: Log Alerts V2",
      priority: 3,
      tags: ["azure-monitor", "fired", "sev2", "log"],
    });
  });

  it("degrades malformed payloads without throwing", () => {
    const malformed = [
      { schemaId: "azureMonitorCommonAlertSchema", data: { essentials: null } },
      {
        schemaId: "azureMonitorCommonAlertSchema",
        data: { essentials: { alertRule: 42, alertTargetIDs: "not-a-list", severity: {} } },
      },
      { schemaId: "azureMonitorCommonAlertSchema", data: { essentials: { alertTargetIDs: [1, null] } } },
    ];
    for (const body of malformed) {
      expect(() => azureMonitorSource.extract(body, {})).not.toThrow();
    }
    const result = azureMonitorSource.extract(malformed[1], {});
    expect(result.title).toBe("[Fired] Azure Monitor alert");
    expect(result.priority).toBeNull();
  });
});
