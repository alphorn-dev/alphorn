import { describe, it, expect } from "vitest";
import { jenkinsSource } from "@/lib/webhook-extract/sources/jenkins";

// Jenkins Notification Plugin JSON (Gson, snake_case keys). Fixtures are fake.
const build = (number: number, phase: string, extra: Record<string, unknown> = {}) => ({
  name: "example-job",
  url: "job/example-job/",
  displayName: "example-job",
  build: {
    full_url: `https://jenkins.example.com/job/example-job/${number}/`,
    url: `job/example-job/${number}/`,
    number,
    phase,
    timestamp: 1700000000000,
    duration: 42000,
    scm: { url: "https://git.example.com/acme/app.git", branch: "main", commit: "abc123" },
    ...extra,
  },
});

describe("jenkinsSource", () => {
  it("formats a queued build", () => {
    const body = build(11, "QUEUED");
    expect(jenkinsSource.detect(body, {})).toBe(true);
    expect(jenkinsSource.extract(body, {})).toEqual({
      title: "example-job #11 queued",
      message:
        "branch main\ncommit abc123\nhttps://jenkins.example.com/job/example-job/11/",
      priority: null,
      tags: ["jenkins", "queued", "example-job"],
    });
  });

  it("formats a started build", () => {
    const body = build(12, "STARTED");
    expect(jenkinsSource.detect(body, {})).toBe(true);
    expect(jenkinsSource.extract(body, {})).toMatchObject({
      title: "example-job #12 started",
      priority: null,
      tags: ["jenkins", "started", "example-job"],
    });
  });

  it("formats a failed build with culprits as priority 4", () => {
    const body = build(12, "FINALIZED", {
      status: "FAILURE",
      scm: {
        url: "https://git.example.com/acme/app.git",
        branch: "main",
        commit: "abc123",
        culprits: ["alice", "bob"],
      },
    });
    expect(jenkinsSource.detect(body, {})).toBe(true);
    expect(jenkinsSource.extract(body, {})).toEqual({
      title: "example-job #12 FAILURE",
      message:
        "branch main\ncommit abc123\nculprits alice, bob\nhttps://jenkins.example.com/job/example-job/12/",
      priority: 4,
      tags: ["jenkins", "finalized", "failure", "example-job"],
    });
  });

  it("formats an unstable build as priority 3", () => {
    const body = build(13, "COMPLETED", { status: "UNSTABLE" });
    expect(jenkinsSource.detect(body, {})).toBe(true);
    expect(jenkinsSource.extract(body, {})).toMatchObject({
      title: "example-job #13 UNSTABLE",
      priority: 3,
      tags: ["jenkins", "completed", "unstable", "example-job"],
    });
  });

  it("formats a successful build with no priority", () => {
    const body = build(14, "FINALIZED", { status: "SUCCESS" });
    expect(jenkinsSource.extract(body, {})).toMatchObject({
      title: "example-job #14 SUCCESS",
      priority: null,
      tags: ["jenkins", "finalized", "success", "example-job"],
    });
  });

  it("uses the status name for aborted builds without priority", () => {
    const body = build(15, "FINALIZED", { status: "ABORTED" });
    expect(jenkinsSource.extract(body, {})).toMatchObject({
      title: "example-job #15 ABORTED",
      priority: null,
    });
  });

  it("does not match generic payloads or GitHub-like payloads", () => {
    expect(jenkinsSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      jenkinsSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    const malformed = { name: 42, build: "nope" };
    expect(() => jenkinsSource.extract(malformed, {})).not.toThrow();
    expect(jenkinsSource.detect(malformed, {})).toBe(false);

    const wrongTypes = {
      name: "example-job",
      build: {
        phase: "FINALIZED",
        number: "12",
        status: 1,
        scm: { culprits: [1, null, "alice"] },
      },
    };
    expect(() => jenkinsSource.extract(wrongTypes, {})).not.toThrow();
    expect(jenkinsSource.extract(wrongTypes, {})).toMatchObject({
      title: "example-job finalized",
      priority: null,
      message: "culprits alice",
    });
  });
});
