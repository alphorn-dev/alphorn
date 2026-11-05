import { describe, it, expect } from "vitest";
import { gitlabSource } from "@/lib/webhook-extract/sources/gitlab";

const project = {
  name: "api",
  path_with_namespace: "example/api",
  web_url: "https://gitlab.example.com/example/api",
};
const alice = { username: "alice", name: "Alice" };
const headers = (event: string) => ({ "x-gitlab-event": event });

describe("gitlabSource", () => {
  it("formats a push with commits", () => {
    const body = {
      object_kind: "push",
      ref: "refs/heads/main",
      user_name: "Alice",
      user_username: "alice",
      before: "1111111111111111111111111111111111111111",
      after: "abc1234def5678abc1234def5678abc1234def56",
      total_commits_count: 2,
      commits: [
        { id: "abc1234def5678abc1234def5678abc1234def56", title: "Fix login", message: "Fix login\n\nDetails" },
        { id: "bbb2222ccc3333bbb2222ccc3333bbb2222ccc33", title: "Add test", message: "Add test" },
      ],
      project,
    };
    expect(gitlabSource.extract(body, headers("Push Hook"))).toEqual({
      title: "[example/api] alice pushed 2 commits to main",
      message: "- abc1234 Fix login\n- bbb2222 Add test\nhttps://gitlab.example.com/example/api",
      priority: null,
      tags: ["gitlab", "push", "api"],
    });
  });

  it("reports a branch deletion", () => {
    const body = {
      object_kind: "push",
      ref: "refs/heads/old-feature",
      user_username: "alice",
      after: "0000000000000000000000000000000000000000",
      commits: [],
      project,
    };
    expect(gitlabSource.extract(body, headers("Push Hook"))).toMatchObject({
      title: "[example/api] alice deleted branch old-feature",
      message: "",
    });
  });

  it("formats a tag push", () => {
    const body = {
      object_kind: "tag_push",
      ref: "refs/tags/v1.0.0",
      user_username: "alice",
      after: "abc1234def5678abc1234def5678abc1234def56",
      commits: [],
      project,
    };
    expect(gitlabSource.extract(body, headers("Tag Push Hook"))).toEqual({
      title: "[example/api] alice pushed tag v1.0.0",
      message: "https://gitlab.example.com/example/api",
      priority: null,
      tags: ["gitlab", "tag_push", "api"],
    });
  });

  it("formats a merge request opened event with description", () => {
    const body = {
      object_kind: "merge_request",
      user: alice,
      project,
      object_attributes: {
        iid: 7,
        title: "Add cache",
        action: "open",
        state: "opened",
        url: "https://gitlab.example.com/example/api/-/merge_requests/7",
        source_branch: "feat/cache",
        target_branch: "main",
        description: "Adds a small cache.",
      },
    };
    expect(gitlabSource.extract(body, headers("Merge Request Hook"))).toEqual({
      title: "[example/api] MR !7 opened: Add cache",
      message:
        "alice opened merge request !7 (feat/cache → main)\nAdds a small cache.\nhttps://gitlab.example.com/example/api/-/merge_requests/7",
      priority: null,
      tags: ["gitlab", "merge_request", "api", "open"],
    });
  });

  it("maps merge action to merged", () => {
    const body = {
      user: alice,
      project,
      object_attributes: { iid: 7, title: "Add cache", action: "merge", state: "merged" },
    };
    expect(gitlabSource.extract(body, headers("Merge Request Hook"))).toMatchObject({
      title: "[example/api] MR !7 merged: Add cache",
    });
  });

  it("formats an issue closed event", () => {
    const body = {
      user: alice,
      project,
      object_attributes: {
        iid: 3,
        title: "Crash on start",
        action: "close",
        state: "closed",
        url: "https://gitlab.example.com/example/api/-/issues/3",
      },
    };
    expect(gitlabSource.extract(body, headers("Issue Hook"))).toEqual({
      title: "[example/api] Issue #3 closed: Crash on start",
      message: "alice closed issue #3\nhttps://gitlab.example.com/example/api/-/issues/3",
      priority: null,
      tags: ["gitlab", "issue", "api", "close"],
    });
  });

  it("formats a comment on a merge request", () => {
    const body = {
      object_kind: "note",
      user: alice,
      project,
      object_attributes: {
        note: "LGTM",
        noteable_type: "MergeRequest",
        action: "create",
        url: "https://gitlab.example.com/example/api/-/merge_requests/7#note_1",
      },
      merge_request: { iid: 7, title: "Add cache" },
    };
    expect(gitlabSource.extract(body, headers("Note Hook"))).toEqual({
      title: "[example/api] Comment created on MR !7: Add cache",
      message: "alice: LGTM\nhttps://gitlab.example.com/example/api/-/merge_requests/7#note_1",
      priority: null,
      tags: ["gitlab", "note", "api"],
    });
  });

  it("formats a comment on a commit", () => {
    const body = {
      user: alice,
      project,
      object_attributes: { note: "Nice", noteable_type: "Commit", action: "create", url: "https://x.example.com/c" },
      commit: { id: "abc1234def5678abc1234def5678abc1234def56", title: "Fix login" },
    };
    expect(gitlabSource.extract(body, headers("Note Hook"))).toMatchObject({
      title: "[example/api] Comment created on commit abc1234",
      message: "alice: Nice\nhttps://x.example.com/c",
    });
  });

  it("marks a failed pipeline with priority 4 and lists failed jobs", () => {
    const body = {
      object_kind: "pipeline",
      user: alice,
      project,
      object_attributes: {
        id: 900,
        ref: "main",
        status: "failed",
        url: "https://gitlab.example.com/example/api/-/pipelines/900",
      },
      builds: [
        { name: "unit", stage: "test", status: "failed" },
        { name: "lint", stage: "test", status: "success" },
      ],
    };
    expect(gitlabSource.extract(body, headers("Pipeline Hook"))).toEqual({
      title: "[example/api] Pipeline failed on main",
      message:
        "alice ran pipeline\n- unit (test)\nhttps://gitlab.example.com/example/api/-/pipelines/900",
      priority: 4,
      tags: ["gitlab", "pipeline", "api", "failed"],
    });
  });

  it("leaves a successful pipeline at normal priority", () => {
    const body = {
      user: alice,
      project,
      object_attributes: { id: 901, ref: "main", status: "success" },
      builds: [],
    };
    expect(gitlabSource.extract(body, headers("Pipeline Hook"))).toMatchObject({
      title: "[example/api] Pipeline success on main",
      priority: null,
    });
  });

  it("formats a release", () => {
    const body = {
      object_kind: "release",
      action: "create",
      tag: "v1.2.0",
      name: "v1.2.0",
      description: "Faster startup.",
      url: "https://gitlab.example.com/example/api/-/releases/v1.2.0",
      project,
    };
    expect(gitlabSource.extract(body, headers("Release Hook"))).toEqual({
      title: "[example/api] Release v1.2.0 created",
      message: "Faster startup.\nhttps://gitlab.example.com/example/api/-/releases/v1.2.0",
      priority: null,
      tags: ["gitlab", "release", "api", "create"],
    });
  });

  it("marks a failed deployment with priority 4", () => {
    const body = {
      object_kind: "deployment",
      status: "failed",
      environment: "production",
      environment_external_url: "https://app.example.com",
      short_sha: "abc1234",
      commit_title: "Fix login",
      user: alice,
      project,
    };
    expect(gitlabSource.extract(body, headers("Deployment Hook"))).toEqual({
      title: "[example/api] Deployment to production failed",
      message: "abc1234 Fix login\nhttps://app.example.com",
      priority: 4,
      tags: ["gitlab", "deployment", "api", "failed"],
    });
  });

  it("uses a generic title for unknown event types", () => {
    const body = { user: alice, project, object_attributes: { action: "create" } };
    expect(gitlabSource.extract(body, headers("Wiki Page Hook"))).toEqual({
      title: "[example/api] wiki page created",
      message: "by alice",
      priority: null,
      tags: ["gitlab", "wiki_page", "api"],
    });
  });

  it("detects by the X-Gitlab-Event header only", () => {
    expect(gitlabSource.detect({}, headers("Push Hook"))).toBe(true);
    expect(gitlabSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(gitlabSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    expect(() =>
      gitlabSource.extract(
        { object_attributes: "x", commits: [null, 5], builds: [null, { status: 3 }], project: "nope" },
        headers("Pipeline Hook")
      )
    ).not.toThrow();
    expect(() =>
      gitlabSource.extract({ ref: 42, commits: "nope", after: null }, headers("Push Hook"))
    ).not.toThrow();
  });
});
