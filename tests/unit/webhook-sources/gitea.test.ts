import { describe, it, expect } from "vitest";
import { giteaSource } from "@/lib/webhook-extract/sources/gitea";

const repository = { full_name: "alice/demo", name: "demo" };
const alice = { login: "alice", username: "alice" };
const bob = { login: "bob", username: "bob" };
const giteaHeaders = (event: string) => ({ "x-gitea-event": event });

describe("gitea source", () => {
  it("formats a push with commits and a compare link", () => {
    const body = {
      ref: "refs/heads/main",
      before: "1111111aaaaaaa",
      after: "2222222bbbbbbb",
      compare_url: "https://git.example.com/alice/demo/compare/1111111...2222222",
      total_commits: 2,
      commits: [
        {
          id: "2222222bbbbbbb",
          message: "Fix login redirect\n\nLong body",
          author: { name: "Alice", username: "alice" },
          url: "https://git.example.com/alice/demo/commit/2222222bbbbbbb",
        },
        {
          id: "3333333ccccccc",
          message: "Add tests",
          author: { name: "Bob", username: "bob" },
          url: "https://git.example.com/alice/demo/commit/3333333ccccccc",
        },
      ],
      repository,
      pusher: alice,
      sender: alice,
    };
    expect(giteaSource.extract(body, giteaHeaders("push"))).toEqual({
      title: "[alice/demo] alice pushed 2 commits to main",
      message: [
        "- 2222222 Fix login redirect (alice)",
        "- 3333333 Add tests (bob)",
        "https://git.example.com/alice/demo/compare/1111111...2222222",
      ].join("\n"),
      priority: null,
      tags: ["gitea", "push", "demo"],
    });
  });

  it("formats a tag push", () => {
    const result = giteaSource.extract(
      { ref: "refs/tags/v1.0.0", total_commits: 0, commits: [], repository, pusher: bob, sender: bob },
      giteaHeaders("push")
    );
    expect(result.title).toBe("[alice/demo] bob pushed tag v1.0.0");
    expect(result.message).toBe("");
  });

  it("formats branch creation and deletion", () => {
    const created = giteaSource.extract(
      { ref: "feature-x", ref_type: "branch", sha: "abc123", repository, sender: alice },
      giteaHeaders("create")
    );
    expect(created).toEqual({
      title: "[alice/demo] alice created branch feature-x",
      message: "",
      priority: null,
      tags: ["gitea", "create", "demo"],
    });

    const deleted = giteaSource.extract(
      { ref: "v0.1.0", ref_type: "tag", pusher_type: "user", repository, sender: bob },
      giteaHeaders("delete")
    );
    expect(deleted.title).toBe("[alice/demo] bob deleted tag v0.1.0");
    expect(deleted.tags).toEqual(["gitea", "delete", "demo"]);
  });

  it("formats an opened pull request with its body excerpt", () => {
    const result = giteaSource.extract(
      {
        action: "opened",
        number: 12,
        pull_request: {
          number: 12,
          title: "Add login page",
          body: "Adds the login form.",
          state: "open",
          merged: false,
          html_url: "https://git.example.com/alice/demo/pulls/12",
          head: { ref: "feature/login", sha: "abc" },
          base: { ref: "main", sha: "def" },
          user: alice,
        },
        repository,
        sender: alice,
      },
      giteaHeaders("pull_request")
    );
    expect(result).toEqual({
      title: "[alice/demo] PR #12 opened: Add login page",
      message: [
        "alice opened pull request #12 (feature/login → main)",
        "Adds the login form.",
        "https://git.example.com/alice/demo/pulls/12",
      ].join("\n"),
      priority: null,
      tags: ["gitea", "pull_request", "demo"],
    });
  });

  it("reports a merged pull request", () => {
    const result = giteaSource.extract(
      {
        action: "closed",
        number: 12,
        pull_request: { number: 12, title: "Add login page", merged: true, head: { ref: "feature/login" }, base: { ref: "main" } },
        repository,
        sender: bob,
      },
      giteaHeaders("pull_request")
    );
    expect(result.title).toBe("[alice/demo] PR #12 merged: Add login page");
    expect(result.message).toBe("bob merged pull request #12 (feature/login → main)");
  });

  it("formats an opened issue", () => {
    const result = giteaSource.extract(
      {
        action: "opened",
        number: 7,
        issue: {
          number: 7,
          title: "Crash on start",
          body: "Steps: run it.",
          state: "open",
          html_url: "https://git.example.com/alice/demo/issues/7",
          user: bob,
        },
        repository,
        sender: bob,
      },
      giteaHeaders("issues")
    );
    expect(result).toEqual({
      title: "[alice/demo] Issue #7 opened: Crash on start",
      message: [
        "bob opened issue #7",
        "Steps: run it.",
        "https://git.example.com/alice/demo/issues/7",
      ].join("\n"),
      priority: null,
      tags: ["gitea", "issues", "demo"],
    });
  });

  it("formats a comment on a pull request", () => {
    const result = giteaSource.extract(
      {
        action: "created",
        issue: { number: 12, title: "Add login page", state: "open" },
        pull_request: { number: 12, title: "Add login page" },
        is_pull: true,
        comment: {
          id: 99,
          body: "Looks good to me",
          html_url: "https://git.example.com/alice/demo/pulls/12#issuecomment-99",
          user: bob,
        },
        repository,
        sender: bob,
      },
      giteaHeaders("issue_comment")
    );
    expect(result).toEqual({
      title: "[alice/demo] Comment created on PR #12: Add login page",
      message: [
        "bob created a comment on PR #12",
        "Looks good to me",
        "https://git.example.com/alice/demo/pulls/12#issuecomment-99",
      ].join("\n"),
      priority: null,
      tags: ["gitea", "issue_comment", "demo"],
    });
  });

  it("formats a deleted issue comment without its body", () => {
    const result = giteaSource.extract(
      {
        action: "deleted",
        issue: { number: 7, title: "Crash on start" },
        is_pull: false,
        comment: { body: "old text", html_url: "" },
        repository,
        sender: alice,
      },
      giteaHeaders("issue_comment")
    );
    expect(result.title).toBe("[alice/demo] Comment deleted on issue #7: Crash on start");
    expect(result.message).toBe("alice deleted a comment on issue #7");
  });

  it("formats a published release", () => {
    const result = giteaSource.extract(
      {
        action: "published",
        release: {
          tag_name: "v1.0.0",
          name: "First release",
          body: "Initial version.",
          html_url: "https://git.example.com/alice/demo/releases/tag/v1.0.0",
          draft: false,
          prerelease: false,
          author: alice,
        },
        repository,
        sender: alice,
      },
      giteaHeaders("release")
    );
    expect(result).toEqual({
      title: "[alice/demo] Release v1.0.0 published",
      message: "Initial version.\nhttps://git.example.com/alice/demo/releases/tag/v1.0.0",
      priority: null,
      tags: ["gitea", "release", "demo"],
    });
  });

  it("detects Forgejo and Gogs headers as well", () => {
    const forgejo = giteaSource.extract(
      { ref: "refs/heads/main", total_commits: 1, commits: [], repository, sender: alice },
      { "x-forgejo-event": "push" }
    );
    expect(forgejo.title).toBe("[alice/demo] alice pushed 1 commit to main");

    const gogs = { "x-gogs-event": "create" };
    expect(giteaSource.detect({}, gogs)).toBe(true);
    expect(
      giteaSource.extract({ ref: "main", ref_type: "branch", repository, sender: alice }, gogs).title
    ).toBe("[alice/demo] alice created branch main");
  });

  it("falls back to a generic title for unknown events", () => {
    expect(
      giteaSource.extract({ action: "created", repository, sender: alice }, giteaHeaders("wiki")).title
    ).toBe("[alice/demo] wiki created");
    expect(giteaSource.extract({}, giteaHeaders("")).title).toBe("Gitea webhook");
  });

  it("detects only on Gitea, Forgejo and Gogs headers", () => {
    expect(giteaSource.detect({}, giteaHeaders("push"))).toBe(true);
    expect(giteaSource.detect({}, { "x-forgejo-event": "push" })).toBe(true);
    expect(giteaSource.detect({}, { "x-gogs-event": "push" })).toBe(true);
    expect(giteaSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      giteaSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
    expect(giteaSource.detect({}, { "x-github-event": "push" })).toBe(false);
  });

  it("degrades malformed payloads instead of throwing", () => {
    const malformed = {
      ref: 42,
      commits: "not-a-list",
      total_commits: "many",
      repository: null,
      pusher: 5,
      sender: ["x"],
    };
    expect(() => giteaSource.extract(malformed, giteaHeaders("push"))).not.toThrow();
    expect(giteaSource.extract(malformed, giteaHeaders("push")).title).toBe("pushed 0 commits");

    const badPr = { action: "opened", number: "12", pull_request: "nope" };
    const result = giteaSource.extract(badPr, giteaHeaders("pull_request"));
    expect(result.title).toBe("PR opened");
    expect(() => giteaSource.extract({ pull_request: null }, giteaHeaders("issue_comment"))).not.toThrow();
  });
});
