import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  generateApiKey,
  generatePublicId,
  hashApiKey,
  apiKeyPrefix,
} from "@/lib/api-key";

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

describe("hashApiKey", () => {
  it("returns the sha256 hex digest of the key", () => {
    const key = "alp_deadbeef";
    const expected = createHash("sha256").update(key, "utf8").digest("hex");
    expect(hashApiKey(key)).toBe(expected);
  });

  it("produces a 64-char hex digest that decodes to 32 bytes", () => {
    const hash = hashApiKey(generateApiKey());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(hash, "hex").length).toBe(32);
  });

  it("is deterministic and distinct per key", () => {
    expect(hashApiKey("a")).toBe(hashApiKey("a"));
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});

describe("apiKeyPrefix", () => {
  it("keeps the leading 12 chars (alp_ + 8 hex)", () => {
    const key = "alp_0123456789abcdef";
    expect(apiKeyPrefix(key)).toBe("alp_01234567");
    expect(apiKeyPrefix(key)).toHaveLength(12);
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
