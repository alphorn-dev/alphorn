import { describe, it, expect } from "vitest";
import { evaluateFilter, evaluateCondition, type FilterMessage } from "@/lib/filter";
import type { FilterDefinition, FilterCondition } from "@/lib/filter/schema";

function msg(overrides: Partial<FilterMessage> = {}): FilterMessage {
  return {
    title: "Test Alert",
    message: "Server is down",
    priority: 3,
    tags: ["infra", "critical"],
    payload: { source: "monitor", host: "web-01" },
    ...overrides,
  };
}

describe("evaluateFilter", () => {
  it("returns true when filter is null", () => {
    expect(evaluateFilter(msg(), null)).toBe(true);
  });

  it("returns true when any group matches (OR logic)", () => {
    const filter: FilterDefinition = {
      groups: [
        { conditions: [{ field: "priority", operator: "equals", value: 99 }] },
        { conditions: [{ field: "priority", operator: "equals", value: 3 }] },
      ],
    };
    expect(evaluateFilter(msg(), filter)).toBe(true);
  });

  it("returns false when no group matches", () => {
    const filter: FilterDefinition = {
      groups: [
        { conditions: [{ field: "priority", operator: "equals", value: 99 }] },
      ],
    };
    expect(evaluateFilter(msg(), filter)).toBe(false);
  });

  it("requires all conditions in a group to match (AND logic)", () => {
    const filter: FilterDefinition = {
      groups: [
        {
          conditions: [
            { field: "priority", operator: "equals", value: 3 },
            { field: "title", operator: "contains", value: "nonexistent" },
          ],
        },
      ],
    };
    expect(evaluateFilter(msg(), filter)).toBe(false);
  });

  it("AND within group, both conditions match", () => {
    const filter: FilterDefinition = {
      groups: [
        {
          conditions: [
            { field: "priority", operator: "equals", value: 3 },
            { field: "title", operator: "contains", value: "Alert" },
          ],
        },
      ],
    };
    expect(evaluateFilter(msg(), filter)).toBe(true);
  });
});

describe("evaluateCondition — priority", () => {
  it("equals", () => {
    const c: FilterCondition = { field: "priority", operator: "equals", value: 3 };
    expect(evaluateCondition(msg(), c)).toBe(true);
    expect(evaluateCondition(msg({ priority: 4 }), c)).toBe(false);
  });

  it("not_equals", () => {
    const c: FilterCondition = { field: "priority", operator: "not_equals", value: 3 };
    expect(evaluateCondition(msg(), c)).toBe(false);
    expect(evaluateCondition(msg({ priority: 5 }), c)).toBe(true);
  });

  it("greater_than", () => {
    const c: FilterCondition = { field: "priority", operator: "greater_than", value: 2 };
    expect(evaluateCondition(msg({ priority: 3 }), c)).toBe(true);
    expect(evaluateCondition(msg({ priority: 1 }), c)).toBe(false);
  });

  it("less_than", () => {
    const c: FilterCondition = { field: "priority", operator: "less_than", value: 4 };
    expect(evaluateCondition(msg({ priority: 3 }), c)).toBe(true);
    expect(evaluateCondition(msg({ priority: 5 }), c)).toBe(false);
  });

  it("between", () => {
    const c: FilterCondition = { field: "priority", operator: "between", value: [2, 4] };
    expect(evaluateCondition(msg({ priority: 3 }), c)).toBe(true);
    expect(evaluateCondition(msg({ priority: 2 }), c)).toBe(true);
    expect(evaluateCondition(msg({ priority: 4 }), c)).toBe(true);
    expect(evaluateCondition(msg({ priority: 1 }), c)).toBe(false);
    expect(evaluateCondition(msg({ priority: 5 }), c)).toBe(false);
  });

  it("returns false when priority is null", () => {
    const c: FilterCondition = { field: "priority", operator: "equals", value: 3 };
    expect(evaluateCondition(msg({ priority: null }), c)).toBe(false);
  });

  it("returns false for an unknown priority operator", () => {
    const c = { field: "priority", operator: "bogus", value: 3 } as unknown as FilterCondition;
    expect(evaluateCondition(msg(), c)).toBe(false);
  });
});

describe("evaluateCondition — tags", () => {
  it("has_any_of", () => {
    const c: FilterCondition = { field: "tags", operator: "has_any_of", value: ["critical", "other"] };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("has_any_of returns false when no match", () => {
    const c: FilterCondition = { field: "tags", operator: "has_any_of", value: ["foo", "bar"] };
    expect(evaluateCondition(msg(), c)).toBe(false);
  });

  it("has_all_of", () => {
    const c: FilterCondition = { field: "tags", operator: "has_all_of", value: ["infra", "critical"] };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("has_all_of fails when missing a tag", () => {
    const c: FilterCondition = { field: "tags", operator: "has_all_of", value: ["infra", "missing"] };
    expect(evaluateCondition(msg(), c)).toBe(false);
  });

  it("has_none_of", () => {
    const c: FilterCondition = { field: "tags", operator: "has_none_of", value: ["foo", "bar"] };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("has_none_of fails when a tag matches", () => {
    const c: FilterCondition = { field: "tags", operator: "has_none_of", value: ["infra", "other"] };
    expect(evaluateCondition(msg(), c)).toBe(false);
  });

  it("tag matching is case-insensitive", () => {
    const c: FilterCondition = { field: "tags", operator: "has_any_of", value: ["CRITICAL"] };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("returns false for an unknown tags operator", () => {
    const c = { field: "tags", operator: "bogus", value: ["infra"] } as unknown as FilterCondition;
    expect(evaluateCondition(msg(), c)).toBe(false);
  });
});

describe("evaluateCondition — string fields (title, message)", () => {
  it("equals (case-insensitive)", () => {
    const c: FilterCondition = { field: "title", operator: "equals", value: "test alert" };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("not_equals", () => {
    const c: FilterCondition = { field: "title", operator: "not_equals", value: "other" };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("contains", () => {
    const c: FilterCondition = { field: "message", operator: "contains", value: "is down" };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("not_contains", () => {
    const c: FilterCondition = { field: "message", operator: "not_contains", value: "up" };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("starts_with", () => {
    const c: FilterCondition = { field: "title", operator: "starts_with", value: "test" };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("regex", () => {
    const c: FilterCondition = { field: "title", operator: "regex", value: "^Test\\s" };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("regex returns false for invalid regex", () => {
    const c: FilterCondition = { field: "title", operator: "regex", value: "[invalid" };
    expect(evaluateCondition(msg(), c)).toBe(false);
  });

  it("regex rejects ReDoS patterns", () => {
    const c: FilterCondition = { field: "title", operator: "regex", value: "(a+)+$" };
    expect(evaluateCondition(msg(), c)).toBe(false);
  });

  it("returns false for an unknown string operator", () => {
    const c = { field: "title", operator: "bogus", value: "Test" } as unknown as FilterCondition;
    expect(evaluateCondition(msg(), c)).toBe(false);
  });
});

describe("evaluateCondition — payload", () => {
  it("resolves nested path and matches", () => {
    const c: FilterCondition = { field: "payload", path: "source", operator: "equals", value: "monitor" };
    expect(evaluateCondition(msg(), c)).toBe(true);
  });

  it("returns false for non-existent path", () => {
    const c: FilterCondition = { field: "payload", path: "missing.key", operator: "equals", value: "x" };
    expect(evaluateCondition(msg(), c)).toBe(false);
  });

  it("blocks __proto__ traversal", () => {
    const c: FilterCondition = { field: "payload", path: "__proto__.polluted", operator: "equals", value: "true" };
    expect(evaluateCondition(msg(), c)).toBe(false);
  });

  it("resolves deep nested paths", () => {
    const m = msg({ payload: { a: { b: { c: "deep" } } } });
    const c: FilterCondition = { field: "payload", path: "a.b.c", operator: "equals", value: "deep" };
    expect(evaluateCondition(m, c)).toBe(true);
  });
});
