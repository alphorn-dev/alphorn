import { describe, expect, it } from "vitest";
import { compareHosts } from "@/lib/webhook-loop/same-host";

describe("compareHosts", () => {
  it("returns true for identical URLs", () => {
    expect(compareHosts("https://app.alphorn.dev", "https://app.alphorn.dev")).toBe(true);
  });

  it("is case-insensitive on hostname", () => {
    expect(compareHosts("https://App.Alphorn.Dev/n/abc", "https://app.alphorn.dev")).toBe(true);
  });

  it("ignores path, query, and fragment", () => {
    expect(
      compareHosts("https://app.alphorn.dev/n/abc?x=1#f", "https://app.alphorn.dev/something"),
    ).toBe(true);
  });

  it("normalizes default ports (https:443, http:80)", () => {
    expect(compareHosts("https://app.alphorn.dev:443/n/abc", "https://app.alphorn.dev")).toBe(true);
    expect(compareHosts("http://app.alphorn.dev:80/n/abc", "http://app.alphorn.dev")).toBe(true);
  });

  it("treats different explicit ports as different hosts", () => {
    expect(compareHosts("https://app.alphorn.dev:8443/n/abc", "https://app.alphorn.dev")).toBe(false);
  });

  it("treats different subdomains as different hosts", () => {
    expect(compareHosts("https://alphorn.dev/x", "https://app.alphorn.dev")).toBe(false);
    expect(compareHosts("https://api.app.alphorn.dev/x", "https://app.alphorn.dev")).toBe(false);
  });

  it("returns false when either URL is unparseable", () => {
    expect(compareHosts("not-a-url", "https://app.alphorn.dev")).toBe(false);
    expect(compareHosts("https://app.alphorn.dev", "also-not-a-url")).toBe(false);
  });

  it("ignores userinfo in the URL", () => {
    expect(
      compareHosts("https://user:pw@app.alphorn.dev/n/abc", "https://app.alphorn.dev"),
    ).toBe(true);
  });
});
