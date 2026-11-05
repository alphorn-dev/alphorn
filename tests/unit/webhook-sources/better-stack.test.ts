import { describe, it, expect } from "vitest";
import { betterStackSource } from "@/lib/webhook-extract/sources/better-stack";

const incident = (attributes: Record<string, unknown>) => ({
  data: {
    id: "abc123",
    type: "incident",
    attributes: {
      name: "Homepage is down",
      url: "https://example.com",
      http_method: "get",
      cause: "Expected status code 200, got 503",
      started_at: "2026-11-05T10:15:00.000Z",
      acknowledged_at: null,
      resolved_at: null,
      response_content: null,
      response_url: null,
      screenshot_url: null,
      ...attributes,
    },
  },
});

describe("betterStackSource", () => {
  it("formats a started incident as high priority", () => {
    const body = incident({});
    expect(betterStackSource.detect(body, {})).toBe(true);
    expect(betterStackSource.extract(body, {})).toEqual({
      title: "Incident started: Homepage is down",
      message:
        "Expected status code 200, got 503\nhttps://example.com\nStarted at 2026-11-05T10:15:00.000Z",
      priority: 4,
      tags: ["better-stack", "incident", "started"],
    });
  });

  it("formats an acknowledged incident without priority", () => {
    const body = incident({ acknowledged_at: "2026-11-05T10:20:00.000Z" });
    expect(betterStackSource.extract(body, {})).toEqual({
      title: "Incident acknowledged: Homepage is down",
      message:
        "Expected status code 200, got 503\nhttps://example.com\nStarted at 2026-11-05T10:15:00.000Z\nAcknowledged at 2026-11-05T10:20:00.000Z",
      priority: null,
      tags: ["better-stack", "incident", "acknowledged"],
    });
  });

  it("formats a resolved incident as recovered", () => {
    const body = incident({
      acknowledged_at: "2026-11-05T10:20:00.000Z",
      resolved_at: "2026-11-05T10:40:00.000Z",
    });
    expect(betterStackSource.detect(body, {})).toBe(true);
    expect(betterStackSource.extract(body, {})).toEqual({
      title: "Incident resolved: Homepage is down",
      message:
        "Expected status code 200, got 503\nhttps://example.com\nStarted at 2026-11-05T10:15:00.000Z\nAcknowledged at 2026-11-05T10:20:00.000Z\nResolved at 2026-11-05T10:40:00.000Z",
      priority: 2,
      tags: ["better-stack", "incident", "resolved"],
    });
  });

  it("formats a comment event", () => {
    const body = {
      ...incident({}),
      event: "comment",
      comment: { id: "c1", type: "comment", attributes: { content: "Looking into it" } },
    };
    expect(betterStackSource.extract(body, {})).toEqual({
      title: "Comment on incident: Homepage is down",
      message: "Looking into it\nhttps://example.com",
      priority: null,
      tags: ["better-stack", "incident", "comment"],
    });
  });

  it("falls back to a generic title when the name is missing", () => {
    const body = incident({ name: undefined });
    expect(betterStackSource.extract(body, {}).title).toBe("Incident started");
  });

  it("does not detect generic or other vendor payloads", () => {
    expect(betterStackSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      betterStackSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    const malformed: unknown[] = [
      { data: "nope" },
      { data: { type: "incident", attributes: "nope" } },
      { data: { type: "incident", attributes: { started_at: 42, cause: null } } },
      { event: "comment", comment: 7 },
      {},
    ];
    for (const body of malformed) {
      expect(() => betterStackSource.detect(body as never, {})).not.toThrow();
      const result = betterStackSource.extract(body as never, {});
      expect(result.title).not.toContain("undefined");
      expect(result.tags).toContain("better-stack");
    }
  });
});
