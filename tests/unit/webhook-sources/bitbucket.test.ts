import { describe, it, expect } from "vitest";
import { bitbucketSource } from "@/lib/webhook-extract/sources/bitbucket";

const repository = {
  full_name: "acme/api",
  name: "api",
  links: { html: { href: "https://bitbucket.org/acme/api" } },
};
const actor = { display_name: "Alice", nickname: "alice" };
const headers = (eventKey: string) => ({
  "x-event-key": eventKey,
  "x-hook-uuid": "{11111111-1111-1111-1111-111111111111}",
  "x-request-uuid": "{22222222-2222-2222-2222-222222222222}",
  "x-attempt-number": "1",
});
const pr = {
  id: 12,
  title: "Add OpenAPI",
  description: "Adds the spec",
  state: "OPEN",
  links: { html: { href: "https://bitbucket.org/acme/api/pull-requests/12" } },
  source: { branch: { name: "feat/openapi" } },
  destination: { branch: { name: "main" } },
};
const prPayload = { actor, repository, pullrequest: pr };

describe("bitbucketSource", () => {
  describe("repo:push", () => {
    const push = (changes: unknown[]) => ({ actor, repository, push: { changes } });
    const commit = (hash: string, message: string) => ({
      hash,
      message,
      author: { user: { display_name: "Bob" } },
    });

    it("formats a push of commits to a branch", () => {
      const result = bitbucketSource.extract(
        push([
          {
            new: { type: "branch", name: "main" },
            old: { type: "branch", name: "main" },
            commits: [commit("abc1234def5678", "Fix typo\n\nLonger body"), commit("bcd2345efa6789", "Add tests")],
            links: { html: { href: "https://bitbucket.org/acme/api/branches/compare/x" } },
          },
        ]),
        headers("repo:push")
      );
      expect(result).toEqual({
        title: "[acme/api] Alice pushed 2 commits to main",
        message:
          "- abc1234 Fix typo (Bob)\n- bcd2345 Add tests (Bob)\nhttps://bitbucket.org/acme/api/branches/compare/x",
        priority: null,
        tags: ["bitbucket", "repo", "push", "api"],
      });
    });

    it("reports a created branch and a deleted branch", () => {
      const created = bitbucketSource.extract(
        push([{ new: { type: "branch", name: "feat/x" }, created: true, commits: [] }]),
        headers("repo:push")
      );
      expect(created.title).toBe("[acme/api] Alice created branch feat/x");

      const deleted = bitbucketSource.extract(
        push([{ new: null, old: { type: "branch", name: "feat/x" }, closed: true, commits: [] }]),
        headers("repo:push")
      );
      expect(deleted.title).toBe("[acme/api] Alice deleted branch feat/x");
    });

    it("formats a tag push", () => {
      const result = bitbucketSource.extract(
        push([{ new: { type: "tag", name: "v1.0.0" }, commits: [] }]),
        headers("repo:push")
      );
      expect(result.title).toBe("[acme/api] Alice pushed tag v1.0.0");
    });
  });

  describe("pullrequest:*", () => {
    it("formats a created pull request with its description", () => {
      expect(bitbucketSource.extract(prPayload, headers("pullrequest:created"))).toEqual({
        title: "[acme/api] PR #12 opened: Add OpenAPI",
        message:
          "Alice opened pull request #12 (feat/openapi → main)\nAdds the spec\nhttps://bitbucket.org/acme/api/pull-requests/12",
        priority: null,
        tags: ["bitbucket", "pullrequest", "created", "api"],
      });
    });

    it("formats fulfilled as merged", () => {
      const result = bitbucketSource.extract(
        { ...prPayload, pullrequest: { ...pr, state: "MERGED" } },
        headers("pullrequest:fulfilled")
      );
      expect(result.title).toBe("[acme/api] PR #12 merged: Add OpenAPI");
      expect(result.priority).toBeNull();
    });

    it("formats rejected as declined", () => {
      const result = bitbucketSource.extract(
        { ...prPayload, pullrequest: { ...pr, state: "DECLINED" } },
        headers("pullrequest:rejected")
      );
      expect(result.title).toBe("[acme/api] PR #12 declined: Add OpenAPI");
    });

    it("formats an approval", () => {
      const result = bitbucketSource.extract(prPayload, headers("pullrequest:approved"));
      expect(result.title).toBe("[acme/api] PR #12 approved: Add OpenAPI");
      expect(result.message).toBe(
        "Alice approved pull request #12\nhttps://bitbucket.org/acme/api/pull-requests/12"
      );
    });

    it("formats a comment with its text", () => {
      const result = bitbucketSource.extract(
        {
          ...prPayload,
          comment: {
            content: { raw: "Looks good to me" },
            links: { html: { href: "https://bitbucket.org/acme/api/pull-requests/12#comment-7" } },
          },
        },
        headers("pullrequest:comment_created")
      );
      expect(result.title).toBe("[acme/api] Comment on PR #12: Add OpenAPI");
      expect(result.message).toBe(
        "Alice: Looks good to me\nhttps://bitbucket.org/acme/api/pull-requests/12#comment-7"
      );
    });
  });

  describe("issue:*", () => {
    const issue = {
      id: 5,
      title: "Login fails",
      state: "new",
      content: { raw: "Steps to reproduce..." },
      links: { html: { href: "https://bitbucket.org/acme/api/issues/5" } },
    };

    it("formats a created issue", () => {
      const result = bitbucketSource.extract({ actor, repository, issue }, headers("issue:created"));
      expect(result).toEqual({
        title: "[acme/api] Issue #5 opened: Login fails",
        message:
          "Alice opened issue #5\nSteps to reproduce...\nhttps://bitbucket.org/acme/api/issues/5",
        priority: null,
        tags: ["bitbucket", "issue", "created", "api"],
      });
    });

    it("marks a resolved issue as recovered", () => {
      const result = bitbucketSource.extract(
        { actor, repository, issue: { ...issue, state: "resolved" } },
        headers("issue:updated")
      );
      expect(result.title).toBe("[acme/api] Issue #5 resolved: Login fails");
      expect(result.priority).toBe(2);
    });

    it("formats an issue comment", () => {
      const result = bitbucketSource.extract(
        {
          actor,
          repository,
          issue,
          comment: { content: { raw: "Same here" }, links: { html: { href: "https://example.com/c" } } },
        },
        headers("issue:comment_created")
      );
      expect(result.title).toBe("[acme/api] Comment on issue #5: Login fails");
      expect(result.message).toBe("Alice: Same here\nhttps://example.com/c");
    });
  });

  describe("repo:commit_status_updated", () => {
    const status = (state: string) => ({
      commit_status: {
        key: "pipeline-1",
        name: "CI / unit",
        state,
        description: "Tests failed",
        url: "https://bitbucket.org/acme/api/pipelines/results/1",
      },
    });

    it("sets priority 4 for a FAILED status", () => {
      const result = bitbucketSource.extract(
        { actor, repository, ...status("FAILED") },
        headers("repo:commit_status_updated")
      );
      expect(result).toEqual({
        title: "[acme/api] Build CI / unit: failed",
        message: "Tests failed\nhttps://bitbucket.org/acme/api/pipelines/results/1",
        priority: 4,
        tags: ["bitbucket", "repo", "commit_status_updated", "api", "failed"],
      });
    });

    it("leaves SUCCESSFUL and INPROGRESS at normal priority", () => {
      expect(
        bitbucketSource.extract(
          { actor, repository, ...status("SUCCESSFUL") },
          headers("repo:commit_status_updated")
        ).priority
      ).toBeNull();
      expect(
        bitbucketSource.extract(
          { actor, repository, ...status("INPROGRESS") },
          headers("repo:commit_status_updated")
        ).title
      ).toBe("[acme/api] Build CI / unit: inprogress");
    });
  });

  describe("generic fallback", () => {
    it("names unknown event keys without throwing", () => {
      const result = bitbucketSource.extract(
        { actor, repository },
        headers("repo:fork")
      );
      expect(result).toEqual({
        title: "[acme/api] repo fork",
        message: "by Alice",
        priority: null,
        tags: ["bitbucket", "repo", "fork", "api"],
      });
    });
  });

  describe("detect", () => {
    it("matches Bitbucket event keys with a Bitbucket delivery header", () => {
      expect(bitbucketSource.detect(prPayload, headers("pullrequest:created"))).toBe(true);
      expect(
        bitbucketSource.detect(prPayload, { "x-event-key": "repo:push", "x-request-uuid": "{x}" })
      ).toBe(true);
    });

    it("does not match generic payloads or other vendors", () => {
      expect(bitbucketSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
      expect(
        bitbucketSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
      ).toBe(false);
      expect(bitbucketSource.detect({}, { "x-event-key": "repo:push" })).toBe(false);
    });
  });

  it("does not throw on malformed payloads", () => {
    const malformed: unknown[] = [
      {},
      { actor: "alice", repository: 42, push: { changes: "nope" } },
      { pullrequest: null, comment: [1, 2] },
      { issue: { id: "5", title: 7 }, commit_status: "FAILED" },
      { push: { changes: [null, 3] }, actor: { display_name: null } },
    ];
    for (const payload of malformed) {
      for (const key of [
        "repo:push",
        "pullrequest:created",
        "pullrequest:comment_created",
        "issue:created",
        "repo:commit_status_updated",
        "weird:event",
      ]) {
        const result = bitbucketSource.extract(payload as Record<string, unknown>, headers(key));
        expect(result.title).not.toMatch(/undefined|null/);
        expect(typeof result.title).toBe("string");
      }
    }
  });
});
