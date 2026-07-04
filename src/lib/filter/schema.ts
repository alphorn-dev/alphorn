import { z } from "zod";

const PriorityCondition = z.object({
  field: z.literal("priority"),
  operator: z.enum(["equals", "not_equals", "greater_than", "less_than", "between"]),
  value: z.union([z.number(), z.array(z.number()).length(2)]),
});

const TagsCondition = z.object({
  field: z.literal("tags"),
  operator: z.enum(["has_any_of", "has_all_of", "has_none_of"]),
  value: z.array(z.string()).min(1),
});

const TitleCondition = z.object({
  field: z.literal("title"),
  operator: z.enum(["equals", "not_equals", "contains", "not_contains", "starts_with", "regex"]),
  value: z.string(),
});

const MessageCondition = z.object({
  field: z.literal("message"),
  operator: z.enum(["equals", "not_equals", "contains", "not_contains", "starts_with", "regex"]),
  value: z.string(),
});

const PayloadCondition = z.object({
  field: z.literal("payload"),
  path: z.string().min(1),
  operator: z.enum(["equals", "not_equals", "contains", "not_contains", "starts_with", "regex"]),
  value: z.string(),
});

export const FilterCondition = z.discriminatedUnion("field", [
  PriorityCondition,
  TagsCondition,
  TitleCondition,
  MessageCondition,
  PayloadCondition,
]);

export const FilterGroup = z.object({
  conditions: z.array(FilterCondition).min(1),
});

export const FilterDefinition = z.object({
  groups: z.array(FilterGroup).min(1),
});

export type FilterCondition = z.infer<typeof FilterCondition>;
export type FilterGroup = z.infer<typeof FilterGroup>;
export type FilterDefinition = z.infer<typeof FilterDefinition>;

export const FIELD_OPERATORS = {
  priority: ["equals", "not_equals", "greater_than", "less_than", "between"],
  tags: ["has_any_of", "has_all_of", "has_none_of"],
  title: ["equals", "not_equals", "contains", "not_contains", "starts_with", "regex"],
  message: ["equals", "not_equals", "contains", "not_contains", "starts_with", "regex"],
  payload: ["equals", "not_equals", "contains", "not_contains", "starts_with", "regex"],
} as const;

export const OPERATOR_LABELS: Record<string, string> = {
  equals: "equals",
  not_equals: "does not equal",
  greater_than: "greater than",
  less_than: "less than",
  between: "between",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  regex: "matches regex",
  has_any_of: "has any of",
  has_all_of: "has all of",
  has_none_of: "has none of",
};

export const FIELD_LABELS: Record<string, string> = {
  priority: "Priority",
  tags: "Tags",
  title: "Title",
  message: "Message",
  payload: "Payload",
};

export const PRIORITY_OPTIONS = [
  { value: 1, label: "Min" },
  { value: 2, label: "Low" },
  { value: 3, label: "Default" },
  { value: 4, label: "High" },
  { value: 5, label: "Urgent" },
] as const;

export const PRIORITY_LABELS: Record<number, string> = Object.fromEntries(
  PRIORITY_OPTIONS.map((p) => [p.value, p.label])
);

/**
 * Map our 1-5 priority scale (see PRIORITY_OPTIONS) onto a channel's own
 * scale. `scale` gives the target value for priorities 1..5 in order —
 * repeat a value to bucket adjacent priorities together (e.g. a 4-level
 * severity scale collapses Min/Low into the same bucket). Channels with a
 * 1:1 mapping (e.g. ntfy) just list five distinct values.
 */
export function mapPriorityScale<T>(
  priority: number | null | undefined,
  scale: readonly [T, T, T, T, T],
  fallback: T
): T {
  if (priority == null) return fallback;
  const index = Math.min(5, Math.max(1, Math.round(priority))) - 1;
  return scale[index];
}

export const FILTER_FIELDS = ["priority", "tags", "title", "message", "payload"] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

export interface ChannelSelection {
  channelId: string;
  filter: FilterDefinition | null;
}

export function validateFilter(filter: FilterDefinition | null): string | null {
  if (!filter) return null;
  for (const [gi, group] of filter.groups.entries()) {
    for (const condition of group.conditions) {
      if (condition.field === "tags" && condition.value.length === 0) {
        return `Group ${gi + 1}: Tags condition requires at least one tag`;
      }
      if (condition.field === "payload" && !condition.path.trim()) {
        return `Group ${gi + 1}: Payload condition requires a path`;
      }
    }
  }
  return null;
}
