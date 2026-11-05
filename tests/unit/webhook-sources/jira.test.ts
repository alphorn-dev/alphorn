import { describe, it, expect } from "vitest";
import { jiraSource } from "@/lib/webhook-extract/sources/jira";

const self = "https://example.atlassian.net/rest/api/2/issue/10001";
const issue = (fields: Record<string, unknown>) => ({
  id: "10001",
  self,
  key: "PROJ-12",
  fields: { summary: "Login fails on Safari", project: { key: "PROJ" }, ...fields },
});
const alice = { accountId: "abc123", displayName: "Alice", active: true };
const bob = { accountId: "def456", displayName: "Bob", active: true };

describe("jiraSource", () => {
  it("formats issue_created with priority Highest as 5", () => {
    const body = {
      timestamp: 1700000000000,
      webhookEvent: "jira:issue_created",
      issue_event_type_name: "issue_created",
      user: alice,
      issue: issue({ status: { name: "To Do" }, priority: { name: "Highest" } }),
    };
    expect(jiraSource.detect(body, {})).toBe(true);
    expect(jiraSource.extract(body, {})).toEqual({
      title: "PROJ-12 created: Login fails on Safari",
      message: "By Alice\nhttps://example.atlassian.net/browse/PROJ-12",
      priority: 5,
      tags: ["jira", "issue_created", "proj", "to do"],
    });
  });

  it("lists changelog items for issue_updated and maps High to 4", () => {
    const body = {
      timestamp: 1700000100000,
      webhookEvent: "jira:issue_updated",
      issue_event_type_name: "issue_generic",
      user: bob,
      issue: issue({ status: { name: "In Progress" }, priority: { name: "High" } }),
      changelog: {
        id: "20001",
        items: [
          { field: "status", fieldtype: "jira", fromString: "To Do", toString: "In Progress" },
          { field: "priority", fieldtype: "jira", fromString: "Medium", toString: "High" },
        ],
      },
    };
    expect(jiraSource.detect(body, {})).toBe(true);
    expect(jiraSource.extract(body, {})).toEqual({
      title: "PROJ-12 updated: Login fails on Safari",
      message: [
        "By Bob",
        "- status: To Do → In Progress",
        "- priority: Medium → High",
        "https://example.atlassian.net/browse/PROJ-12",
      ].join("\n"),
      priority: 4,
      tags: ["jira", "issue_updated", "proj", "in progress"],
    });
  });

  it("formats issue_deleted without priority", () => {
    const body = {
      timestamp: 1700000200000,
      webhookEvent: "jira:issue_deleted",
      user: alice,
      issue: issue({ status: { name: "Done" }, priority: { name: "Low" } }),
    };
    expect(jiraSource.detect(body, {})).toBe(true);
    expect(jiraSource.extract(body, {})).toEqual({
      title: "PROJ-12 deleted: Login fails on Safari",
      message: "By Alice\nhttps://example.atlassian.net/browse/PROJ-12",
      priority: null,
      tags: ["jira", "issue_deleted", "proj", "done"],
    });
  });

  it("includes the comment body for comment_created", () => {
    const body = {
      timestamp: 1700000300000,
      webhookEvent: "comment_created",
      comment: { id: "10010", body: "Reproduced on Safari 17.2", author: bob },
      user: bob,
      issue: issue({ status: { name: "To Do" } }),
    };
    expect(jiraSource.detect(body, {})).toBe(true);
    expect(jiraSource.extract(body, {})).toEqual({
      title: "PROJ-12 comment added: Login fails on Safari",
      message: "By Bob\nReproduced on Safari 17.2\nhttps://example.atlassian.net/browse/PROJ-12",
      priority: null,
      tags: ["jira", "comment_created", "proj", "to do"],
    });
  });

  it("falls back to a readable title for unknown event types", () => {
    const result = jiraSource.extract(
      { webhookEvent: "jira:version_released", issue: issue({}) },
      {}
    );
    expect(result.title).toBe("PROJ-12 version released: Login fails on Safari");
    expect(result.title).not.toContain("undefined");
  });

  it("detects by the Atlassian webhook identifier header", () => {
    const header = { "x-atlassian-webhook-identifier": "abc" };
    expect(jiraSource.detect({ webhookEvent: "jira:version_released" }, header)).toBe(true);
    // Other Atlassian products send the same header without a Jira event name.
    expect(jiraSource.detect({ event: "page_created" }, header)).toBe(false);
  });

  it("does not detect generic or other-vendor payloads", () => {
    expect(jiraSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      jiraSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    const malformed = [
      { webhookEvent: 42, issue: "oops", changelog: { items: "x" }, comment: null },
      { webhookEvent: "jira:issue_updated", issue: { key: 7, fields: null }, changelog: { items: [null, 3] } },
      {},
    ];
    for (const body of malformed) {
      expect(() => jiraSource.extract(body, {})).not.toThrow();
      expect(jiraSource.extract(body, {}).title).not.toContain("undefined");
    }
  });
});
