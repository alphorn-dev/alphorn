import { describe, expect, it } from "vitest";
import { isRelevantGithubEvent } from "@/lib/github/events";

describe("isRelevantGithubEvent", () => {
  it("lets one release through as a single message", () => {
    const kept = ["created", "published", "released"].filter((action) =>
      isRelevantGithubEvent("release", { action })
    );
    expect(kept).toEqual(["published"]);
  });

  it("keeps only the completed workflow run", () => {
    expect(isRelevantGithubEvent("workflow_run", { action: "requested" })).toBe(false);
    expect(isRelevantGithubEvent("workflow_run", { action: "in_progress" })).toBe(false);
    expect(isRelevantGithubEvent("workflow_run", { action: "completed" })).toBe(true);
  });

  it("drops pull request noise but keeps lifecycle actions", () => {
    expect(isRelevantGithubEvent("pull_request", { action: "synchronize" })).toBe(false);
    expect(isRelevantGithubEvent("pull_request", { action: "labeled" })).toBe(false);
    expect(isRelevantGithubEvent("pull_request", { action: "opened" })).toBe(true);
    expect(isRelevantGithubEvent("pull_request", { action: "closed" })).toBe(true);
  });

  it("keeps only final deployment states", () => {
    const state = (s: string) => ({ action: "created", deployment_status: { state: s } });
    expect(isRelevantGithubEvent("deployment_status", state("in_progress"))).toBe(false);
    expect(isRelevantGithubEvent("deployment_status", state("inactive"))).toBe(false);
    expect(isRelevantGithubEvent("deployment_status", state("success"))).toBe(true);
    expect(isRelevantGithubEvent("deployment_status", state("failure"))).toBe(true);
  });

  it("passes events without an action filter", () => {
    expect(isRelevantGithubEvent("push", {})).toBe(true);
    expect(isRelevantGithubEvent("deployment_review", { action: "approved" })).toBe(true);
  });
});
