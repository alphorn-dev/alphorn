import { describe, it, expect } from "vitest";
import { resolveTemplate } from "@/lib/webhook-extract/template";
import { resolvePath } from "@/lib/safe-path";

describe("resolvePath", () => {
  it("returns undefined for missing path", () => {
    expect(resolvePath({ a: 1 }, "b")).toBeUndefined();
  });

  it("resolves a single-segment path", () => {
    expect(resolvePath({ a: 1 }, "a")).toBe(1);
  });

  it("resolves a dotted path", () => {
    expect(resolvePath({ a: { b: { c: "x" } } }, "a.b.c")).toBe("x");
  });

  it("resolves numeric array indices", () => {
    expect(resolvePath({ items: [{ name: "first" }] }, "items.0.name")).toBe("first");
  });

  it("returns undefined when crossing a null", () => {
    expect(resolvePath({ a: null }, "a.b")).toBeUndefined();
  });

  it("returns undefined when crossing a primitive", () => {
    expect(resolvePath({ a: 1 }, "a.b")).toBeUndefined();
  });
});

describe("resolveTemplate", () => {
  it("returns the template unchanged when there are no placeholders", () => {
    expect(resolveTemplate("hello world", { a: 1 })).toBe("hello world");
  });

  it("substitutes a single placeholder", () => {
    expect(resolveTemplate("{name}", { name: "alice" })).toBe("alice");
  });

  it("substitutes multiple placeholders", () => {
    expect(resolveTemplate("{action}: {issue.title}", {
      action: "opened",
      issue: { title: "Bug" },
    })).toBe("opened: Bug");
  });

  it("renders missing paths as empty string", () => {
    expect(resolveTemplate("{a}-{b}", { a: "x" })).toBe("x-");
  });

  it("coerces numbers and booleans", () => {
    expect(resolveTemplate("{n}/{b}", { n: 42, b: true })).toBe("42/true");
  });

  it("renders objects as empty string", () => {
    expect(resolveTemplate("{obj}", { obj: { a: 1 } })).toBe("");
  });

  it("renders arrays as empty string", () => {
    expect(resolveTemplate("{arr}", { arr: [1, 2] })).toBe("");
  });

  it("supports nested bracket-free dot paths", () => {
    expect(resolveTemplate("{a.b.c}", { a: { b: { c: "deep" } } })).toBe("deep");
  });

  it("leaves unmatched braces literal", () => {
    expect(resolveTemplate("not a {placeholder with space}", {})).toBe(
      "not a {placeholder with space}"
    );
  });

  it("returns empty string when the template is empty", () => {
    expect(resolveTemplate("", { a: 1 })).toBe("");
  });
});
