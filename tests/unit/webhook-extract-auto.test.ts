import { describe, it, expect } from "vitest";
import { extractAuto } from "@/lib/webhook-extract/auto";
import { extractFromPayload } from "@/lib/webhook-extract";

const repository = { full_name: "acme/api", name: "api" };
const gh = (event: string) => ({ "x-github-event": event });

describe("extractAuto: GitHub", () => {
  it("formats an opened pull request", () => {
    const result = extractAuto(
      {
        action: "opened",
        repository,
        sender: { login: "octo" },
        pull_request: {
          number: 12,
          title: "Add OpenAPI",
          body: "Adds the spec",
          html_url: "https://github.com/acme/api/pull/12",
          merged: false,
          head: { ref: "feat/openapi" },
          base: { ref: "main" },
        },
      },
      gh("pull_request")
    );
    expect(result).toEqual({
      title: "[acme/api] PR #12 opened: Add OpenAPI",
      message:
        "octo opened pull request #12 (feat/openapi → main)\nAdds the spec\nhttps://github.com/acme/api/pull/12",
      priority: null,
      tags: ["github", "pull_request", "api"],
    });
  });

  it("reports a closed+merged pull request as merged", () => {
    const result = extractAuto(
      { action: "closed", repository, pull_request: { number: 3, title: "X", merged: true } },
      gh("pull_request")
    );
    expect(result?.title).toBe("[acme/api] PR #3 merged: X");
  });

  it("lists pushed commits", () => {
    const result = extractAuto(
      {
        ref: "refs/heads/main",
        repository,
        pusher: { name: "octo" },
        compare: "https://github.com/acme/api/compare/a...b",
        commits: [
          { id: "abcdef1234", message: "Fix bug\n\nlong body", author: { username: "octo" } },
          { id: "1234567890", message: "Docs", author: { name: "Jane" } },
        ],
      },
      gh("push")
    );
    expect(result?.title).toBe("[acme/api] octo pushed 2 commits to main");
    expect(result?.message).toBe(
      "- abcdef1 Fix bug (octo)\n- 1234567 Docs (Jane)\nhttps://github.com/acme/api/compare/a...b"
    );
  });

  it("distinguishes PR comments from issue comments", () => {
    const result = extractAuto(
      {
        action: "created",
        repository,
        issue: { number: 7, title: "Crash", pull_request: { url: "x" } },
        comment: { user: { login: "jane" }, body: "LGTM", html_url: "https://c" },
      },
      gh("issue_comment")
    );
    expect(result?.title).toBe("[acme/api] Comment created on PR #7: Crash");
    expect(result?.message).toBe("jane: LGTM\nhttps://c");
  });

  it("raises priority for failed workflow runs", () => {
    const result = extractAuto(
      {
        action: "completed",
        repository,
        workflow_run: {
          name: "CI",
          status: "completed",
          conclusion: "failure",
          head_branch: "main",
          display_title: "Fix bug",
          actor: { login: "octo" },
          html_url: "https://run",
        },
      },
      gh("workflow_run")
    );
    expect(result?.title).toBe('[acme/api] Workflow "CI" failure on main');
    expect(result?.priority).toBe(4);
  });

  it("handles unknown events and malformed payloads without throwing", () => {
    expect(extractAuto({ action: "created", repository, sender: { login: "o" } }, gh("label"))?.title).toBe(
      "[acme/api] label created"
    );
    expect(() => extractAuto({ pull_request: "nope", commits: "nope" }, gh("pull_request"))).not.toThrow();
    expect(() => extractAuto({ commits: "nope" }, gh("push"))).not.toThrow();
  });
});

describe("extractAuto: other sources", () => {
  it("maps Sentry issue level to priority", () => {
    const result = extractAuto(
      {
        action: "created",
        data: { issue: { title: "TypeError", culprit: "app.js", level: "error", web_url: "https://s" } },
      },
      { "sentry-hook-resource": "issue" }
    );
    expect(result).toMatchObject({
      title: "Issue created: TypeError",
      message: "app.js\nhttps://s",
      priority: 4,
    });
  });

  it("formats Stripe amounts using the currency's minor unit", () => {
    const usd = extractAuto(
      { object: "event", type: "invoice.payment_failed", data: { object: { id: "in_1", amount_due: 1999, currency: "usd" } } },
      {}
    );
    expect(usd?.message).toBe("$19.99\nin_1");
    expect(usd?.priority).toBe(4);

    const jpy = extractAuto(
      { object: "event", type: "charge.succeeded", data: { object: { amount: 500, currency: "jpy" } } },
      {}
    );
    expect(jpy?.message).toBe("¥500");

    const bogus = extractAuto(
      { object: "event", type: "charge.succeeded", data: { object: { amount: 5, currency: "nope!" } } },
      {}
    );
    expect(bogus?.message).toBe("5 nope!");
  });

  it("formats Alertmanager and maps severity", () => {
    const result = extractAuto(
      {
        status: "firing",
        groupKey: "{}:{}",
        commonLabels: { alertname: "HighCPU", severity: "critical" },
        alerts: [{ annotations: { summary: "CPU > 90%", description: "on web-1" } }],
      },
      {}
    );
    expect(result).toMatchObject({
      title: "[FIRING:1] HighCPU",
      message: "- CPU > 90%: on web-1",
      priority: 5,
      tags: ["alertmanager", "firing", "critical"],
    });
  });

  it("prefers Grafana's pre-rendered title/message", () => {
    const result = extractAuto(
      { orgId: 1, status: "resolved", groupKey: "k", alerts: [], title: "[RESOLVED] Disk", message: "ok now" },
      {}
    );
    expect(result).toMatchObject({ title: "[RESOLVED] Disk", message: "ok now", priority: 2 });
  });

  it("returns null for unknown sources", () => {
    expect(extractAuto({ title: "Hi" }, {})).toBeNull();
  });
});

describe("extractFromPayload modes", () => {
  const templates = {
    titleTemplate: "T: {title}",
    messageTemplate: null,
    tagsTemplate: null,
    priorityTemplate: null,
  };
  const prBody = { action: "opened", repository, pull_request: { number: 1, title: "PR" } };

  it("auto: uses the source formatter and ignores templates", () => {
    const result = extractFromPayload({ body: prBody, headers: gh("pull_request"), mode: "auto", templates });
    expect(result.title).toBe("[acme/api] PR #1 opened: PR");
  });

  it("auto: falls back to the generic heuristic for unknown sources", () => {
    const result = extractFromPayload({ body: { title: "Hi", message: "Yo" }, headers: {}, mode: "auto", templates });
    expect(result).toMatchObject({ title: "Hi", message: "Yo" });
  });

  it("none: ignores both source detection and templates", () => {
    const result = extractFromPayload({ body: prBody, headers: gh("pull_request"), mode: "none", templates });
    expect(result.title).toBe("opened: PR");
  });

  it("template: applies templates", () => {
    const result = extractFromPayload({ body: { title: "Hi" }, headers: {}, mode: "template", templates });
    expect(result.title).toBe("T: Hi");
  });
});
