import { describe, expect, it } from "vitest";
import { cn, sanitizeRedirect } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and removes falsy values", () => {
    expect(cn("px-2", false && "hidden", "py-1")).toBe("px-2 py-1");
  });

  it("resolves conflicting Tailwind classes in favor of the later one", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });
});

describe("sanitizeRedirect", () => {
  it("allows plain same-origin paths", () => {
    expect(sanitizeRedirect("/webhooks/abc")).toBe("/webhooks/abc");
    expect(sanitizeRedirect("/invite/tok?x=1")).toBe("/invite/tok?x=1");
  });

  it("rejects absolute URLs", () => {
    expect(sanitizeRedirect("https://evil.com")).toBe("/");
    expect(sanitizeRedirect("http://evil.com/path")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeRedirect("//evil.com")).toBe("/");
  });

  it("rejects backslash variants", () => {
    expect(sanitizeRedirect("/\\evil.com")).toBe("/");
  });

  it("falls back to / for empty or non-string values", () => {
    expect(sanitizeRedirect("")).toBe("/");
    expect(sanitizeRedirect(null)).toBe("/");
    expect(sanitizeRedirect(undefined)).toBe("/");
  });
});
