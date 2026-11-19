import { describe, expect, it } from "vitest";
import { messageOrderBy, parsePageSize } from "@/app/(dashboard)/messages/query";

describe("messageOrderBy", () => {
  it("defaults to newest first for missing or invalid sorts", () => {
    for (const sort of [undefined, "", "title", "title.sideways", "payload.asc", "constructor.asc"]) {
      expect(messageOrderBy(sort)).toEqual([{ createdAt: "desc" }]);
    }
  });

  it("sorts by createdAt without a redundant tiebreak", () => {
    expect(messageOrderBy("createdAt.asc")).toEqual([{ createdAt: "asc" }]);
  });

  it("adds a createdAt tiebreak and puts null titles last", () => {
    expect(messageOrderBy("title.asc")).toEqual([
      { title: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
    expect(messageOrderBy("webhook.desc")).toEqual([{ webhook: { name: "desc" } }, { createdAt: "desc" }]);
  });
});

describe("parsePageSize", () => {
  it("accepts only the offered sizes", () => {
    expect(parsePageSize("50")).toBe(50);
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("10000")).toBe(25);
    expect(parsePageSize(undefined)).toBe(25);
  });
});
