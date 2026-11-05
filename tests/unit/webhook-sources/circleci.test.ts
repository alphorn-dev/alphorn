import { describe, it, expect } from "vitest";
import { circleciSource } from "@/lib/webhook-extract/sources/circleci";

const headers = (event: string) => ({ "circleci-event-type": event });

const project = { name: "api", slug: "github/example/api" };
const pipeline = {
  number: 42,
  vcs: {
    branch: "main",
    revision: "abc123",
    commit: { subject: "Fix retry logic", body: "" },
  },
};

describe("circleciSource", () => {
  it("formats a failed workflow", () => {
    const body = {
      id: "evt1",
      type: "workflow-completed",
      happened_at: "2026-01-01T00:00:00Z",
      project,
      pipeline,
      workflow: {
        name: "build-test-deploy",
        status: "failed",
        url: "https://app.circleci.com/pipelines/github/example/api/42/workflows/w1",
      },
    };
    expect(circleciSource.detect(body, headers("workflow-completed"))).toBe(true);
    expect(circleciSource.extract(body, headers("workflow-completed"))).toEqual({
      title: "[api] Workflow build failed on main",
      message:
        "Fix retry logic\nWorkflow: build-test-deploy\nPipeline #42\nhttps://app.circleci.com/pipelines/github/example/api/42/workflows/w1",
      priority: 4,
      tags: ["circleci", "workflow-completed", "failed", "api"],
    });
  });

  it("formats a successful workflow without priority", () => {
    const body = {
      type: "workflow-completed",
      project,
      pipeline,
      workflow: { name: "build-test-deploy", status: "success", url: "https://ci/w2" },
    };
    expect(circleciSource.extract(body, headers("workflow-completed"))).toEqual({
      title: "[api] Workflow build succeeded on main",
      message: "Fix retry logic\nWorkflow: build-test-deploy\nPipeline #42\nhttps://ci/w2",
      priority: null,
      tags: ["circleci", "workflow-completed", "success", "api"],
    });
  });

  it("formats a failed job with the job name in the title", () => {
    const body = {
      type: "job-completed",
      project,
      pipeline,
      workflow: { name: "build-test-deploy" },
      job: { name: "test", number: 136, status: "failed", id: "j1" },
    };
    expect(circleciSource.extract(body, headers("job-completed"))).toEqual({
      title: "[api] Job test build failed on main",
      message: "Fix retry logic\nJob: test\nWorkflow: build-test-deploy\nPipeline #42",
      priority: 4,
      tags: ["circleci", "job-completed", "failed", "api"],
    });
  });

  it("falls back to trigger parameters for branch and commit title", () => {
    const body = {
      type: "workflow-completed",
      project,
      pipeline: {
        number: 7,
        trigger_parameters: {
          git: { branch: "feature/x" },
          gitlab: { commit_title: "Add thing" },
        },
      },
      workflow: { name: "ci", status: "error" },
    };
    expect(circleciSource.extract(body, headers("workflow-completed"))).toMatchObject({
      title: "[api] Workflow build error on feature/x",
      message: "Add thing\nWorkflow: ci\nPipeline #7",
      priority: 4,
    });
  });

  it("uses a generic title for unknown event types", () => {
    const result = circleciSource.extract({ type: "something-new" }, headers("something-new"));
    expect(result).toEqual({
      title: "CircleCI: something new",
      message: "",
      priority: null,
      tags: ["circleci", "something-new"],
    });
  });

  it("does not match generic or GitHub-like payloads", () => {
    expect(circleciSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      circleciSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    expect(() =>
      circleciSource.extract(
        { type: 5, project: "api", pipeline: { number: "42", vcs: { branch: 1 } }, workflow: [] },
        headers("workflow-completed")
      )
    ).not.toThrow();
    expect(
      circleciSource.extract({ project: null, job: { status: ["failed"] } }, headers("job-completed"))
    ).toEqual({
      title: "[CircleCI] Job build completed",
      message: "",
      priority: null,
      tags: ["circleci", "job-completed"],
    });
  });
});
