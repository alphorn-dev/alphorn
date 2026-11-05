import { describe, it, expect } from "vitest";
import { dockerHubSource } from "@/lib/webhook-extract/sources/docker-hub";

const pushPayload = {
  callback_url: "https://registry.hub.docker.com/u/alice/api/hook/abc123/",
  push_data: { pushed_at: 1417566161, pusher: "alice", tag: "latest" },
  repository: {
    comment_count: 0,
    date_created: 1417494799,
    description: "",
    dockerfile: "",
    full_description: "",
    is_official: false,
    is_private: true,
    is_trusted: false,
    name: "api",
    namespace: "alice",
    owner: "alice",
    repo_name: "alice/api",
    repo_url: "https://registry.hub.docker.com/u/alice/api/",
    star_count: 0,
    status: "Active",
  },
};

describe("dockerHubSource", () => {
  it("formats an image push with pusher and repo URL", () => {
    expect(dockerHubSource.extract(pushPayload, {})).toEqual({
      title: "Pushed alice/api:latest",
      message: "Pushed by alice\nhttps://registry.hub.docker.com/u/alice/api/",
      priority: null,
      tags: ["docker-hub", "push", "alice/api", "latest"],
    });
  });

  it("omits the tag when push_data has none", () => {
    const body = { ...pushPayload, push_data: { pushed_at: 1417566161, pusher: "alice" } };
    expect(dockerHubSource.extract(body, {})).toMatchObject({
      title: "Pushed alice/api",
      tags: ["docker-hub", "push", "alice/api"],
    });
  });

  it("detects Docker Hub push payloads by shape", () => {
    expect(dockerHubSource.detect(pushPayload, {})).toBe(true);
  });

  it("does not detect generic or other-vendor payloads", () => {
    expect(dockerHubSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(
      dockerHubSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
    ).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    expect(() =>
      dockerHubSource.extract({ push_data: "nope", repository: { repo_name: 42 } }, {})
    ).not.toThrow();
    expect(dockerHubSource.extract({ push_data: "nope", repository: { repo_name: 42 } }, {})).toEqual({
      title: "Docker Hub push",
      message: "",
      priority: null,
      tags: ["docker-hub", "push"],
    });
    expect(() => dockerHubSource.extract({ push_data: { tag: 7 } }, {})).not.toThrow();
  });
});
