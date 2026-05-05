import { describe, it, expect, vi } from "vitest";
import { formatSseEvent, formatSseComment, type SseConfig } from "@/lib/sse/format";
import type { Notification } from "@/channels/types";

const baseNotification: Notification = {
  title: "Deploy Complete",
  message: "v2.1.0 deployed to production",
  priority: 4,
  tags: ["deploy", "prod"],
  payload: { env: "production", version: "2.1.0", title: "ignored" },
};

const fullConfig: SseConfig = {
  format: "json",
  includePriority: true,
  includeTags: true,
  includePayload: true,
};

describe("formatSseEvent — JSON format", () => {
  it("includes title, message, and timestamp", () => {
    vi.useFakeTimers({ now: new Date("2026-01-15T10:00:00Z") });
    const event = formatSseEvent(baseNotification, fullConfig);
    const data = JSON.parse(event.replace("data: ", "").trim());
    expect(data.title).toBe("Deploy Complete");
    expect(data.message).toBe("v2.1.0 deployed to production");
    expect(data.timestamp).toBe("2026-01-15T10:00:00.000Z");
    vi.useRealTimers();
  });

  it("includes priority when configured", () => {
    const event = formatSseEvent(baseNotification, fullConfig);
    const data = JSON.parse(event.replace("data: ", "").trim());
    expect(data.priority).toBe(4);
  });

  it("excludes priority when not configured", () => {
    const event = formatSseEvent(baseNotification, { ...fullConfig, includePriority: false });
    const data = JSON.parse(event.replace("data: ", "").trim());
    expect(data.priority).toBeUndefined();
  });

  it("includes tags when configured", () => {
    const event = formatSseEvent(baseNotification, fullConfig);
    const data = JSON.parse(event.replace("data: ", "").trim());
    expect(data.tags).toEqual(["deploy", "prod"]);
  });

  it("excludes tags when not configured", () => {
    const event = formatSseEvent(baseNotification, { ...fullConfig, includeTags: false });
    const data = JSON.parse(event.replace("data: ", "").trim());
    expect(data.tags).toBeUndefined();
  });

  it("includes payload when configured", () => {
    const event = formatSseEvent(baseNotification, fullConfig);
    const data = JSON.parse(event.replace("data: ", "").trim());
    expect(data.payload).toEqual(baseNotification.payload);
  });

  it("ends with double newline (SSE spec)", () => {
    const event = formatSseEvent(baseNotification, fullConfig);
    expect(event).toMatch(/\n\n$/);
  });

  it("starts with 'data: ' prefix", () => {
    const event = formatSseEvent(baseNotification, fullConfig);
    expect(event).toMatch(/^data: /);
  });
});

describe("formatSseEvent — text format", () => {
  const textConfig: SseConfig = { ...fullConfig, format: "text" };

  it("produces pipe-separated output", () => {
    const event = formatSseEvent(baseNotification, textConfig);
    expect(event).toMatch(/^data: .+\n\n$/);
    const parts = event.replace("data: ", "").trim().split(" | ");
    // timestamp | priority | title | message | tags | payload
    expect(parts.length).toBeGreaterThanOrEqual(4);
  });

  it("includes title and message", () => {
    const event = formatSseEvent(baseNotification, textConfig);
    expect(event).toContain("Deploy Complete");
    expect(event).toContain("v2.1.0 deployed to production");
  });

  it("includes tags as comma-separated", () => {
    const event = formatSseEvent(baseNotification, textConfig);
    expect(event).toContain("deploy, prod");
  });

  it("excludes duplicate keys from payload (title, message, priority, tags)", () => {
    const event = formatSseEvent(baseNotification, textConfig);
    // The payload part should contain env and version but not the duplicated title
    const parts = event.replace("data: ", "").trim().split(" | ");
    const payloadStr = parts[parts.length - 1];
    const payloadObj = JSON.parse(payloadStr);
    expect(payloadObj.env).toBe("production");
    expect(payloadObj.version).toBe("2.1.0");
    expect(payloadObj.title).toBeUndefined();
  });

  it("omits optional text parts when priority, tags, or payload extras are absent", () => {
    const event = formatSseEvent(
      {
        title: "Deploy Complete",
        message: "done",
        tags: [],
        payload: { title: "dup", message: "dup", tags: ["dup"], priority: 1 },
      },
      textConfig
    );

    const parts = event.replace("data: ", "").trim().split(" | ");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe("Deploy Complete");
    expect(parts[2]).toBe("done");
  });
});

describe("formatSseEvent — JSON omissions", () => {
  it("omits payload when it is not configured", () => {
    const event = formatSseEvent(baseNotification, { ...fullConfig, includePayload: false });
    const data = JSON.parse(event.replace("data: ", "").trim());
    expect(data.payload).toBeUndefined();
  });

  it("omits optional fields when the notification does not include them", () => {
    const event = formatSseEvent(
      { title: "Plain", message: "Body" },
      fullConfig
    );
    const data = JSON.parse(event.replace("data: ", "").trim());
    expect(data.priority).toBeUndefined();
    expect(data.tags).toBeUndefined();
    expect(data.payload).toBeUndefined();
  });
});

describe("formatSseComment", () => {
  it("formats as SSE comment", () => {
    expect(formatSseComment("keepalive")).toBe(": keepalive\n\n");
  });
});
