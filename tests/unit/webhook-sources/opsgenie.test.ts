import { describe, it, expect } from "vitest";
import { opsgenieSource } from "@/lib/webhook-extract/sources/opsgenie";

const alert = {
  alertId: "abc123",
  tinyId: "1",
  alias: "disk-full-api-1",
  message: "Disk full on api-1",
  username: "alice",
  description: "/var is at 98%",
  priority: "P1",
  tags: ["Prod", "Disk"],
  integration: { id: "int1", name: "Webhook1", type: "Webhook" },
};

const base = {
  source: { name: "example.com", type: "API" },
  integrationId: "int1",
  integrationName: "Webhook1",
};

describe("opsgenie source", () => {
  it("formats a created P1 alert", () => {
    const body = { ...base, action: "Create", alert };
    expect(opsgenieSource.detect(body, {})).toBe(true);
    expect(opsgenieSource.extract(body, {})).toEqual({
      title: "[P1] Alert created: Disk full on api-1",
      message: "Priority: P1\nBy: alice\nAlias: disk-full-api-1\n/var is at 98%",
      priority: 5,
      tags: ["opsgenie", "create", "p1", "prod", "disk"],
    });
  });

  it("formats an acknowledged P3 alert", () => {
    const body = { ...base, action: "Acknowledge", alert: { ...alert, priority: "P3" } };
    expect(opsgenieSource.detect(body, {})).toBe(true);
    expect(opsgenieSource.extract(body, {})).toEqual({
      title: "[P3] Alert acknowledged: Disk full on api-1",
      message: "Priority: P3\nBy: alice\nAlias: disk-full-api-1\n/var is at 98%",
      priority: 3,
      tags: ["opsgenie", "acknowledge", "p3", "prod", "disk"],
    });
  });

  it("treats Close as a recovery (priority 2) regardless of alert priority", () => {
    const body = { ...base, action: "Close", alert };
    const result = opsgenieSource.extract(body, {});
    expect(result.title).toBe("[P1] Alert closed: Disk full on api-1");
    expect(result.priority).toBe(2);
    expect(result.tags).toContain("close");
  });

  it("formats an AddNote without priority when alert has none", () => {
    const body = {
      ...base,
      action: "AddNote",
      alert: { alertId: "abc123", message: "Disk full on api-1" },
    };
    expect(opsgenieSource.detect(body, {})).toBe(true);
    expect(opsgenieSource.extract(body, {})).toEqual({
      title: "Alert note added: Disk full on api-1",
      message: "",
      priority: null,
      tags: ["opsgenie", "addnote"],
    });
  });

  it("detects via alert.integration.type when top-level integration fields are absent", () => {
    const body = { action: "Create", alert };
    expect(opsgenieSource.detect(body, {})).toBe(true);
  });

  it("falls back to a spaced action name for unknown actions", () => {
    const body = { ...base, action: "UpdatePriority", alert };
    expect(opsgenieSource.extract(body, {}).title).toBe(
      "[P1] Alert update priority: Disk full on api-1"
    );
  });

  it("does not match generic or other-vendor payloads", () => {
    expect(opsgenieSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      opsgenieSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
    expect(opsgenieSource.detect({ action: "Create", alert: { alertId: "x" } }, {})).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    expect(() => opsgenieSource.extract({ action: 42, alert: "nope" }, {})).not.toThrow();
    const result = opsgenieSource.extract(
      { action: "Create", alert: { alertId: 7, priority: 1, tags: "x", message: null } },
      {}
    );
    expect(result.title).toBe("Alert created: unknown alert");
    expect(result.priority).toBeNull();
    expect(result.tags).toEqual(["opsgenie", "create"]);
  });
});
