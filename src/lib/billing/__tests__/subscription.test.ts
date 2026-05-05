import { describe, it, expect } from "vitest";
import { isWithinQuota } from "../subscription";

describe("isWithinQuota", () => {
  it("returns true when usage is under limit", () => {
    expect(isWithinQuota(100, 5000)).toBe(true);
  });

  it("returns false when usage meets limit", () => {
    expect(isWithinQuota(5000, 5000)).toBe(false);
  });

  it("returns true when limit is null (unlimited)", () => {
    expect(isWithinQuota(999999, null)).toBe(true);
  });
});
