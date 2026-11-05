import { describe, it, expect } from "vitest";
import { graylogSource } from "@/lib/webhook-extract/sources/graylog";

const definition = {
  event_definition_id: "5f0000000000000000000001",
  event_definition_type: "aggregation-v1",
  event_definition_title: "Brute force detection",
  event_definition_description: "More than 5 failed logins per minute",
  job_definition_id: "5f0000000000000000000002",
  job_trigger_id: "5f0000000000000000000003",
};

const event = (priority: unknown) => ({
  id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
  event_definition_type: "aggregation-v1",
  event_definition_id: "5f0000000000000000000001",
  origin_context: null,
  timestamp: "2026-11-05T10:15:45.000Z",
  timestamp_processing: "2026-11-05T10:18:26.844Z",
  timerange_start: "2026-11-05T10:14:47.502Z",
  timerange_end: "2026-11-05T10:15:47.501Z",
  streams: [],
  source_streams: ["5f0000000000000000000004"],
  message: "Login failures: sum(failed)=12.0",
  source: "web-1.example.com",
  key_tuple: [],
  key: "",
  priority,
  alert: true,
  fields: {},
});

const backlogEntry = {
  id: "abc123",
  index: "graylog_0",
  source: "web-1.example.com",
  message: "POST /login failed for alice@example.com",
  timestamp: "2026-11-05T10:15:30.000Z",
};

describe("graylog source", () => {
  it("formats a high priority aggregation alert with backlog", () => {
    const body = { ...definition, event: event(3), backlog: [backlogEntry, { ...backlogEntry, id: "abc124" }] };
    expect(graylogSource.detect(body, {})).toBe(true);
    expect(graylogSource.extract(body, {})).toEqual({
      title: "Brute force detection: Login failures: sum(failed)=12.0",
      message: "More than 5 failed logins per minute\nSource: web-1.example.com\nBacklog: 2 messages",
      priority: 4,
      tags: ["graylog", "aggregation-v1", "web-1.example.com"],
    });
  });

  it("never includes backlog message text", () => {
    const body = { ...definition, event: event(3), backlog: [backlogEntry] };
    expect(graylogSource.extract(body, {}).message).not.toContain("alice@example.com");
  });

  it("maps normal priority to 3 and omits empty description and backlog", () => {
    const body = { ...definition, event_definition_description: undefined, event: event(2) };
    expect(graylogSource.detect(body, {})).toBe(true);
    expect(graylogSource.extract(body, {})).toEqual({
      title: "Brute force detection: Login failures: sum(failed)=12.0",
      message: "Source: web-1.example.com",
      priority: 3,
      tags: ["graylog", "aggregation-v1", "web-1.example.com"],
    });
  });

  it("maps low priority to 2 and singularizes a single backlog message", () => {
    const body = { ...definition, event: event(1), backlog: [backlogEntry] };
    const result = graylogSource.extract(body, {});
    expect(result.message).toBe("More than 5 failed logins per minute\nSource: web-1.example.com\nBacklog: 1 message");
    expect(result.priority).toBe(2);
  });

  it("returns null priority when event priority is missing or not a number", () => {
    expect(graylogSource.extract({ ...definition, event: event(undefined) }, {}).priority).toBeNull();
    expect(graylogSource.extract({ ...definition, event: event("3") }, {}).priority).toBeNull();
    expect(graylogSource.extract({ ...definition, event: event(9) }, {}).priority).toBeNull();
  });

  it("does not match generic or other vendor payloads", () => {
    expect(graylogSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(graylogSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})).toBe(false);
    expect(graylogSource.detect({ event_definition_id: "5f00", event_definition_title: "x" }, {})).toBe(false);
  });

  it("degrades malformed payloads to empty text without throwing", () => {
    const malformed = {
      event_definition_id: 5,
      event_definition_title: "Brute force detection",
      event: { ...event("3"), message: 42 },
      backlog: "not a list",
    };
    expect(() => graylogSource.extract(malformed, {})).not.toThrow();
    expect(graylogSource.extract(malformed, {})).toEqual({
      title: "Brute force detection triggered",
      message: "Source: web-1.example.com",
      priority: null,
      tags: ["graylog", "web-1.example.com"],
    });
  });
});
