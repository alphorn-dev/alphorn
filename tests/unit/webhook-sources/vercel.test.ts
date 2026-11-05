import { describe, it, expect } from "vitest";
import { vercelSource } from "@/lib/webhook-extract/sources/vercel";

const headers = { "x-vercel-signature": "0123456789abcdef" };

const deployment = (type: string, extra: Record<string, unknown> = {}) => ({
  id: "evt_abc123",
  type,
  createdAt: 1700000000000,
  region: null,
  payload: {
    team: { id: "team_abc123" },
    user: { id: "user_abc123" },
    target: "production",
    project: { id: "prj_abc123" },
    deployment: {
      id: "dpl_abc123",
      name: "my-app",
      url: "my-app-abc123.example.com",
      meta: {
        githubCommitRef: "main",
        githubCommitMessage: "fix: handle empty cart\n\nlonger body",
        githubCommitAuthorName: "alice",
      },
    },
    links: {
      deployment: "https://vercel.com/acme/my-app/dpl_abc123",
      project: "https://vercel.com/acme/my-app",
    },
    ...extra,
  },
});

describe("vercelSource", () => {
  it("detects by the x-vercel-signature header only", () => {
    expect(vercelSource.detect(deployment("deployment.created"), headers)).toBe(true);
    expect(vercelSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      vercelSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("formats deployment.created as started", () => {
    expect(vercelSource.extract(deployment("deployment.created"), headers)).toEqual({
      title: "my-app deployment started (production)",
      message: [
        "Branch: main",
        "Commit: fix: handle empty cart",
        "Author: alice",
        "https://vercel.com/acme/my-app/dpl_abc123",
      ].join("\n"),
      priority: null,
      tags: ["vercel", "deployment.created", "production", "my-app", "main"],
    });
  });

  it("formats deployment.succeeded", () => {
    const result = vercelSource.extract(deployment("deployment.succeeded"), headers);
    expect(result.title).toBe("my-app deployment succeeded (production)");
    expect(result.priority).toBeNull();
    expect(result.tags).toContain("deployment.succeeded");
  });

  it("formats deployment.error as a failure with priority 4", () => {
    const result = vercelSource.extract(deployment("deployment.error"), headers);
    expect(result.title).toBe("my-app deployment failed (production)");
    expect(result.priority).toBe(4);
    expect(result.tags).toEqual(["vercel", "deployment.error", "production", "my-app", "main"]);
  });

  it("formats deployment.canceled and omits the target when null", () => {
    const result = vercelSource.extract(
      deployment("deployment.canceled", { target: null }),
      headers
    );
    expect(result.title).toBe("my-app deployment canceled");
    expect(result.priority).toBeNull();
    expect(result.tags).toEqual(["vercel", "deployment.canceled", "my-app", "main"]);
  });

  it("works without git metadata", () => {
    const result = vercelSource.extract(
      deployment("deployment.error", { deployment: { id: "dpl_abc123", name: "my-app", meta: {} } }),
      headers
    );
    expect(result.title).toBe("my-app deployment failed (production)");
    expect(result.message).toBe("https://vercel.com/acme/my-app/dpl_abc123");
  });

  it("uses a generic title for project events and unknown types", () => {
    const created = vercelSource.extract(
      { type: "project.created", payload: { project: { id: "prj_abc123", name: "my-app" } } },
      headers
    );
    expect(created).toEqual({
      title: "my-app: project.created",
      message: "",
      priority: null,
      tags: ["vercel", "project.created", "my-app"],
    });

    const unknown = vercelSource.extract({ type: "domain.created", payload: {} }, headers);
    expect(unknown.title).toBe("Vercel: domain.created");
  });

  it("does not throw on malformed payloads", () => {
    expect(() => vercelSource.extract({}, headers)).not.toThrow();
    expect(vercelSource.extract({}, headers).title).toBe("Vercel: event");
    expect(() =>
      vercelSource.extract(
        { type: 42, payload: { deployment: { meta: "nope", name: 7 }, target: [] } },
        headers
      )
    ).not.toThrow();
    const malformed = vercelSource.extract(
      { type: "deployment.error", payload: { deployment: { meta: { githubCommitMessage: 5 } } } },
      headers
    );
    expect(malformed.title).toBe("Vercel deployment failed");
    expect(malformed.priority).toBe(4);
  });
});
