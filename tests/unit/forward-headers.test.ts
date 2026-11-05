import { describe, it, expect } from "vitest";
import { pickForwardHeaders } from "@/lib/forward-headers";

describe("pickForwardHeaders", () => {
  it("keeps event headers and drops credentials, signatures and hop headers", () => {
    const result = pickForwardHeaders({
      "Content-Type": "application/json",
      "x-github-event": "push",
      "x-github-delivery": "abc123",
      "x-event-key": "repo:push",
      "user-agent": "GitHub-Hookshot/abc123",
      authorization: "Bearer secret",
      cookie: "a=b",
      "x-api-key": "secret",
      "x-hub-signature-256": "sha256=abc",
      "stripe-signature": "t=1,v1=abc",
      "x-gitlab-token": "secret",
      host: "app.example.com",
      "content-length": "42",
      "x-forwarded-for": "203.0.113.1",
      "cf-ray": "abc123",
      "x-alphorn-trace": "t",
    });
    expect(result).toEqual({
      "content-type": "application/json",
      "x-github-event": "push",
      "x-github-delivery": "abc123",
      "x-event-key": "repo:push",
      "user-agent": "GitHub-Hookshot/abc123",
    });
  });
});
