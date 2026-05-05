import { describe, it, expect } from "vitest";
import { extractFromPayload } from "@/lib/webhook-extract";

describe("extractFromPayload", () => {
  it("uses the template when set", () => {
    const result = extractFromPayload({
      body: { action: "opened", issue: { title: "Bug", body: "details" } },
      headers: {},
      templates: {
        titleTemplate: "{action}: {issue.title}",
        messageTemplate: "{issue.body}",
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.title).toBe("opened: Bug");
    expect(result.message).toBe("details");
  });

  it("falls back to heuristic when template is null", () => {
    const result = extractFromPayload({
      body: { title: "Hi", message: "Hello" },
      headers: {},
      templates: {
        titleTemplate: null,
        messageTemplate: null,
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.title).toBe("Hi");
    expect(result.message).toBe("Hello");
  });

  it("falls back to heuristic when template resolves to empty", () => {
    const result = extractFromPayload({
      body: { title: "Heuristic title", message: "Heuristic message" },
      headers: {},
      templates: {
        titleTemplate: "{missing.path}",
        messageTemplate: "{also.missing}",
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.title).toBe("Heuristic title");
    expect(result.message).toBe("Heuristic message");
  });

  it("falls back to stringified JSON when message is still empty", () => {
    const result = extractFromPayload({
      body: { unrelated: { stuff: 42 } },
      headers: {},
      templates: {
        titleTemplate: null,
        messageTemplate: null,
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.title).toBeNull();
    expect(result.message).toContain("unrelated");
    expect(result.message).toContain("42");
  });

  it("truncates the JSON fallback to 4000 chars", () => {
    const huge: Record<string, string> = {};
    for (let i = 0; i < 500; i++) huge[`k${i}`] = "v".repeat(20);
    const result = extractFromPayload({
      body: huge,
      headers: {},
      templates: {
        titleTemplate: null,
        messageTemplate: null,
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.message.length).toBe(4000);
  });

  it("supports header access for alphanumeric names via $headers", () => {
    const result = extractFromPayload({
      body: { issue: { title: "Bug" } },
      headers: { xevent: "issues" },
      templates: {
        titleTemplate: "{$headers.xevent}: {issue.title}",
        messageTemplate: null,
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.title).toBe("issues: Bug");
  });

  it("strips sensitive headers before exposing to templates", () => {
    const result = extractFromPayload({
      body: { issue: { title: "Bug" } },
      headers: {
        authorization: "Bearer secret",
        cookie: "session=xyz",
        "x-api-key": "key123",
        "x-auth-token": "tok",
      },
      templates: {
        titleTemplate:
          "[{$headers.authorization}][{$headers.cookie}][{$headers.x_api_key}][{$headers.x_auth_token}]",
        messageTemplate: "fallback",
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.title).toBe("[][][][]");
  });

  it("truncates very long templated titles to 200 chars", () => {
    const long = "x".repeat(500);
    const result = extractFromPayload({
      body: { title: long },
      headers: {},
      templates: {
        titleTemplate: null,
        messageTemplate: "msg",
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.title?.length).toBe(200);
  });

  it("truncates very long templated messages to 4000 chars", () => {
    const long = "y".repeat(5000);
    const result = extractFromPayload({
      body: { message: long },
      headers: {},
      templates: {
        titleTemplate: null,
        messageTemplate: null,
        tagsTemplate: null,
        priorityTemplate: null,
      },
    });
    expect(result.message.length).toBe(4000);
  });

  it("parses tags from a template that resolves to comma string", () => {
    const result = extractFromPayload({
      body: { repo: "alphorn", env: "prod" },
      headers: {},
      templates: {
        titleTemplate: null,
        messageTemplate: "{repo}",
        tagsTemplate: "{repo},{env}",
        priorityTemplate: null,
      },
    });
    expect(result.tags).toEqual(["alphorn", "prod"]);
  });

  it("parses priority from a template that resolves to a number string", () => {
    const result = extractFromPayload({
      body: { level: 3 },
      headers: {},
      templates: {
        titleTemplate: null,
        messageTemplate: "{level}",
        tagsTemplate: null,
        priorityTemplate: "{level}",
      },
    });
    expect(result.priority).toBe(3);
  });

  it("falls back to heuristic priority/tags when templates resolve empty", () => {
    const result = extractFromPayload({
      body: { message: "hi", priority: 9, tags: ["alert"] },
      headers: {},
      templates: {
        titleTemplate: null,
        messageTemplate: null,
        tagsTemplate: "{missing}",
        priorityTemplate: "{missing}",
      },
    });
    expect(result.priority).toBe(9);
    expect(result.tags).toEqual(["alert"]);
  });
});
