import type { FilterDefinition, FilterCondition } from "./schema";
import isSafeRegex from "safe-regex2";
import { resolvePath } from "@/lib/safe-path";

export interface FilterMessage {
  title: string | null;
  message: string;
  priority: number | null;
  tags: string[];
  payload: unknown;
}

/**
 * Evaluate a filter definition against a message.
 * Returns true if the message should be delivered (matches filter or no filter set).
 */
export function evaluateFilter(
  message: FilterMessage,
  filter: FilterDefinition | null
): boolean {
  if (!filter) return true;
  // OR: any group match → deliver
  return filter.groups.some((group) =>
    // AND: all conditions in group must match
    group.conditions.every((condition) => evaluateCondition(message, condition))
  );
}

/**
 * Evaluate a single condition against a message.
 * Returns true if the condition matches.
 */
export function evaluateCondition(
  message: FilterMessage,
  condition: FilterCondition
): boolean {
  switch (condition.field) {
    case "priority":
      return evaluatePriority(message.priority, condition.operator, condition.value);
    case "tags":
      return evaluateTags(message.tags, condition.operator, condition.value);
    case "title":
      return evaluateString(message.title ?? "", condition.operator, condition.value);
    case "message":
      return evaluateString(message.message, condition.operator, condition.value);
    case "payload":
      return evaluatePayload(message.payload, condition.path, condition.operator, condition.value);
  }
}

function evaluatePriority(
  priority: number | null,
  operator: string,
  value: number | number[]
): boolean {
  if (priority === null) return false;
  switch (operator) {
    case "equals":
      return priority === value;
    case "not_equals":
      return priority !== value;
    case "greater_than":
      return priority > (value as number);
    case "less_than":
      return priority < (value as number);
    case "between": {
      const [min, max] = value as number[];
      return priority >= min && priority <= max;
    }
    default:
      return false;
  }
}

function evaluateTags(
  tags: string[],
  operator: string,
  value: string[]
): boolean {
  const lowerTags = tags.map((t) => t.toLowerCase());
  const lowerValue = value.map((v) => v.toLowerCase());
  switch (operator) {
    case "has_any_of":
      return lowerValue.some((v) => lowerTags.includes(v));
    case "has_all_of":
      return lowerValue.every((v) => lowerTags.includes(v));
    case "has_none_of":
      return !lowerValue.some((v) => lowerTags.includes(v));
    default:
      return false;
  }
}

function evaluateString(
  text: string,
  operator: string,
  value: string
): boolean {
  const lower = text.toLowerCase();
  const lowerValue = value.toLowerCase();
  switch (operator) {
    case "equals":
      return lower === lowerValue;
    case "not_equals":
      return lower !== lowerValue;
    case "contains":
      return lower.includes(lowerValue);
    case "not_contains":
      return !lower.includes(lowerValue);
    case "starts_with":
      return lower.startsWith(lowerValue);
    case "regex":
      try {
        const re = new RegExp(value, "i");
        if (!isSafeRegex(re)) return false;
        return re.test(text);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function evaluatePayload(
  payload: unknown,
  path: string,
  operator: string,
  value: string
): boolean {
  const resolved = resolvePath(payload, path);
  if (resolved === undefined) return false;
  return evaluateString(String(resolved), operator, value);
}
