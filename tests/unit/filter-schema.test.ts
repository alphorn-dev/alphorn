import { describe, it, expect } from "vitest";
import {
  validateFilter,
  FilterDefinition,
  FIELD_OPERATORS,
  OPERATOR_LABELS,
  FIELD_LABELS,
  PRIORITY_OPTIONS,
  PRIORITY_LABELS,
  FILTER_FIELDS,
} from "@/lib/filter/schema";

describe("validateFilter", () => {
  it("returns null for null filter", () => {
    expect(validateFilter(null)).toBeNull();
  });

  it("returns null for valid filter", () => {
    const filter: FilterDefinition = {
      groups: [
        {
          conditions: [{ field: "priority", operator: "equals", value: 3 }],
        },
      ],
    };
    expect(validateFilter(filter)).toBeNull();
  });

  it("returns error for empty tags value", () => {
    const filter: FilterDefinition = {
      groups: [
        {
          conditions: [{ field: "tags", operator: "has_any_of", value: [] }],
        },
      ],
    };
    expect(validateFilter(filter)).toMatch(/Tags condition requires at least one tag/);
  });

  it("returns error for empty payload path", () => {
    const filter: FilterDefinition = {
      groups: [
        {
          conditions: [
            { field: "payload", path: "  ", operator: "equals", value: "test" },
          ],
        },
      ],
    };
    expect(validateFilter(filter)).toMatch(/Payload condition requires a path/);
  });

  it("includes group number in error message", () => {
    const filter: FilterDefinition = {
      groups: [
        { conditions: [{ field: "priority", operator: "equals", value: 1 }] },
        {
          conditions: [{ field: "tags", operator: "has_any_of", value: [] }],
        },
      ],
    };
    expect(validateFilter(filter)).toMatch(/Group 2/);
  });

  it("returns the first validation error it encounters", () => {
    const filter: FilterDefinition = {
      groups: [
        {
          conditions: [
            { field: "tags", operator: "has_any_of", value: [] },
            { field: "payload", path: "", operator: "equals", value: "test" },
          ],
        },
      ],
    };
    expect(validateFilter(filter)).toBe(
      "Group 1: Tags condition requires at least one tag"
    );
  });
});

describe("filter schema metadata", () => {
  it("exposes the expected operators for each field", () => {
    expect(FIELD_OPERATORS.priority).toContain("between");
    expect(FIELD_OPERATORS.tags).toEqual(["has_any_of", "has_all_of", "has_none_of"]);
    expect(FIELD_OPERATORS.payload).toContain("regex");
  });

  it("defines human-readable labels for fields and operators", () => {
    expect(OPERATOR_LABELS.not_contains).toBe("does not contain");
    expect(FIELD_LABELS.payload).toBe("Payload");
  });

  it("keeps priority options and labels in sync", () => {
    expect(PRIORITY_OPTIONS).toHaveLength(5);
    expect(PRIORITY_LABELS[1]).toBe("Min");
    expect(PRIORITY_LABELS[5]).toBe("Urgent");
  });

  it("lists all supported filter fields", () => {
    expect(FILTER_FIELDS).toEqual(["priority", "tags", "title", "message", "payload"]);
  });
});
