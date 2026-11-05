import { describe, it, expect } from "vitest";
import { linearSource } from "@/lib/webhook-extract/sources/linear";

const headers = { "linear-event": "Issue", "linear-delivery": "00000000-0000-4000-8000-000000000000" };

const issue = (overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  action: "create",
  type: "Issue",
  createdAt: "2026-01-01T10:00:00.000Z",
  url: "https://linear.app/example/issue/ENG-123/fix-login",
  actor: { id: "abc123", name: "alice", type: "user" },
  data: {
    id: "abc123",
    identifier: "ENG-123",
    number: 123,
    title: "Fix login",
    priority: 0,
    priorityLabel: "No priority",
    state: { name: "Todo", type: "unstarted" },
    team: { key: "ENG", name: "Engineering" },
    ...data,
  },
  ...overrides,
});

describe("linearSource", () => {
  it("detects Linear by the Linear-Event header only", () => {
    expect(linearSource.detect({}, headers)).toBe(true);
    expect(linearSource.detect({ action: "create", type: "Issue" }, {})).toBe(false);
    expect(linearSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(linearSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})).toBe(false);
  });

  it("formats a created issue without priority", () => {
    expect(linearSource.extract(issue(), headers)).toEqual({
      title: "ENG-123 create: Fix login",
      message: "State: Todo\nPriority: No priority\nBy alice\nhttps://linear.app/example/issue/ENG-123/fix-login",
      priority: null,
      tags: ["linear", "issue", "create", "eng"],
    });
  });

  it("maps urgent and high issue priority to 5 and 4", () => {
    const urgent = linearSource.extract(issue({ action: "update" }, { priority: 1, priorityLabel: "Urgent" }), headers);
    expect(urgent.title).toBe("ENG-123 update: Fix login");
    expect(urgent.priority).toBe(5);
    expect(linearSource.extract(issue({}, { priority: 2 }), headers).priority).toBe(4);
    expect(linearSource.extract(issue({}, { priority: 3 }), headers).priority).toBeNull();
  });

  it("lists changed fields on update", () => {
    const result = linearSource.extract(
      issue({
        action: "update",
        updatedFrom: { stateId: "def456", priority: 0 },
      }),
      headers
    );
    expect(result.message).toContain("Changed: stateId, priority");
  });

  it("formats a comment using the issue identifier from the URL", () => {
    const result = linearSource.extract(
      {
        action: "create",
        type: "Comment",
        url: "https://linear.app/example/issue/ENG-123/fix-login#comment-abc123",
        actor: { name: "bob" },
        data: { id: "cmt123", body: "Repro on Safari only", issueId: "abc123" },
      },
      { "linear-event": "Comment" }
    );
    expect(result).toEqual({
      title: "ENG-123 comment create",
      message:
        "Repro on Safari only\nBy bob\nhttps://linear.app/example/issue/ENG-123/fix-login#comment-abc123",
      priority: null,
      tags: ["linear", "comment", "create"],
    });
  });

  it("formats a project update", () => {
    const result = linearSource.extract(
      {
        action: "update",
        type: "Project",
        url: "https://linear.app/example/project/launch-abc123",
        actor: { name: "alice" },
        data: { id: "prj123", name: "Launch", status: { id: "sts123", name: "Started", type: "started" } },
      },
      { "linear-event": "Project" }
    );
    expect(result).toEqual({
      title: "Project update: Launch",
      message: "State: Started\nBy alice\nhttps://linear.app/example/project/launch-abc123",
      priority: null,
      tags: ["linear", "project", "update"],
    });
  });

  it("falls back to a generic title for unknown types", () => {
    const result = linearSource.extract({ action: "remove", type: "Label", data: {} }, { "linear-event": "Label" });
    expect(result.title).toBe("Linear label remove");
    expect(result.priority).toBeNull();
  });

  it("does not throw on malformed payloads", () => {
    expect(() => linearSource.extract({ type: "Issue", data: { priority: "urgent", state: "x" } }, headers)).not.toThrow();
    expect(() => linearSource.extract({ type: 42, updatedFrom: [1, 2], data: null }, headers)).not.toThrow();
    expect(() => linearSource.extract({}, {})).not.toThrow();
    expect(linearSource.extract({ type: "Issue", data: { priority: "urgent" } }, headers).title).toBe("Issue");
  });
});
