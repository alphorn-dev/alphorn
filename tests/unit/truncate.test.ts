import { describe, expect, it } from "vitest";
import { truncate } from "@/channels/truncate";

describe("truncate", () => {
  it("returns text unchanged when at or under the limit", () => {
    expect(truncate("abc", 3)).toBe("abc");
    expect(truncate("", 5)).toBe("");
  });

  it("cuts to exactly max chars with a trailing ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abcdef", 4)).toHaveLength(4);
  });

  it("truncates at the one-over boundary", () => {
    expect(truncate("abcd", 3)).toBe("ab…");
  });

  it("does not slice negatively on a zero budget", () => {
    expect(truncate("abc", 0)).toBe("…");
  });
});
