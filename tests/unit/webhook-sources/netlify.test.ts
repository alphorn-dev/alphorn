import { describe, it, expect } from "vitest";
import { netlifySource } from "@/lib/webhook-extract/sources/netlify";

const deploy = {
  id: "abc123",
  site_id: "site-1111",
  name: "my-site",
  state: "ready",
  branch: "main",
  context: "production",
  title: "Fix footer link",
  deploy_ssl_url: "https://main--my-site.example.com",
  admin_url: "https://app.netlify.com/sites/my-site/deploys/abc123",
  error_message: null,
};

// Unsigned JWS-shaped header (only the claims segment matters for detection).
const jws = (claims: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const signed = { "x-webhook-signature": jws({ iss: "netlify", sha256: "00" }) };

describe("netlifySource", () => {
  it("formats a successful deploy", () => {
    expect(netlifySource.extract(deploy, signed)).toEqual({
      title: "[my-site] deploy succeeded: Fix footer link",
      message:
        "branch main (production)\nhttps://main--my-site.example.com",
      priority: null,
      tags: ["netlify", "ready", "production", "my-site"],
    });
  });

  it("formats a failed deploy with the error message at priority 4", () => {
    const result = netlifySource.extract(
      { ...deploy, state: "error", error_message: "Build script returned non-zero exit code: 2" },
      signed
    );
    expect(result).toEqual({
      title: "[my-site] deploy failed: Fix footer link",
      message:
        "branch main (production)\nBuild script returned non-zero exit code: 2\nhttps://main--my-site.example.com",
      priority: 4,
      tags: ["netlify", "error", "production", "my-site"],
    });
  });

  it("formats a building deploy without priority", () => {
    const result = netlifySource.extract({ ...deploy, state: "building" }, signed);
    expect(result.title).toBe("[my-site] deploy building: Fix footer link");
    expect(result.priority).toBeNull();
  });

  it("falls back to the admin url and a generic title for unknown states", () => {
    const result = netlifySource.extract(
      { name: "my-site", state: "processing", deploy_ssl_url: "", admin_url: "https://app.netlify.com/x" },
      {}
    );
    expect(result.title).toBe("[my-site] deploy processing");
    expect(result.message).toBe("https://app.netlify.com/x");
    expect(result.tags).toEqual(["netlify", "processing", "my-site"]);
  });

  it("detects by the JWS issuer header", () => {
    expect(netlifySource.detect({}, signed)).toBe(true);
    expect(netlifySource.detect({}, { "x-webhook-signature": jws({ iss: "other" }) })).toBe(false);
    expect(netlifySource.detect({}, { "x-webhook-signature": "not-a-jws" })).toBe(false);
  });

  it("detects by payload shape when all three fields are present", () => {
    expect(netlifySource.detect(deploy, {})).toBe(true);
    expect(netlifySource.detect({ site_id: "x", state: "ready" }, {})).toBe(false);
  });

  it("does not match generic or GitHub-like payloads", () => {
    expect(netlifySource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(netlifySource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})).toBe(false);
  });

  it("does not throw on malformed payloads", () => {
    expect(() => netlifySource.extract({ name: 42, state: { x: 1 }, branch: null }, {})).not.toThrow();
    const result = netlifySource.extract({ name: 42, state: { x: 1 }, branch: null }, {});
    expect(result.title).toBe("[Netlify] deploy updated");
    expect(result.priority).toBeNull();
    expect(result.message).toBe("");
    expect(() => netlifySource.extract({ error_message: ["x"] }, {})).not.toThrow();
  });
});
