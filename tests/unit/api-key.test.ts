import { describe, it, expect } from "vitest";
import { generateApiKey, generatePublicId } from "@/lib/api-key";

describe("generateApiKey", () => {
  it("starts with alp_ prefix", () => {
    expect(generateApiKey()).toMatch(/^alp_/);
  });

  it("has correct length (4 prefix + 64 hex chars)", () => {
    const key = generateApiKey();
    expect(key.length).toBe(4 + 64);
  });

  it("contains only hex chars after prefix", () => {
    const key = generateApiKey();
    expect(key.slice(4)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey()));
    expect(keys.size).toBe(50);
  });
});

describe("generatePublicId", () => {
  it("has length 21", () => {
    expect(generatePublicId().length).toBe(21);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generatePublicId()));
    expect(ids.size).toBe(50);
  });
});
