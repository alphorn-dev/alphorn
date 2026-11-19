import type { Prisma } from "@/generated/prisma/client";

export const PAGE_SIZES = [25, 50, 100] as const;

export function parsePageSize(size: string | undefined): number {
  return PAGE_SIZES.find((s) => String(s) === size) ?? PAGE_SIZES[0];
}

// ponytail: only createdAt is index-backed; title/priority/webhook sorts scan
// the org's filtered messages. Add indexes if large orgs sort by them often.
const SORT_COLUMNS: Record<string, (dir: Prisma.SortOrder) => Prisma.MessageOrderByWithRelationInput> = {
  title: (dir) => ({ title: { sort: dir, nulls: "last" } }),
  priority: (dir) => ({ priority: { sort: dir, nulls: "last" } }),
  webhook: (dir) => ({ webhook: { name: dir } }),
  createdAt: (dir) => ({ createdAt: dir }),
};

/** `sort` is "<column>.<asc|desc>" from the URL; anything else means newest first. */
export function messageOrderBy(sort: string | undefined): Prisma.MessageOrderByWithRelationInput[] {
  const [column, dir] = (sort ?? "").split(".");
  if (!Object.hasOwn(SORT_COLUMNS, column) || (dir !== "asc" && dir !== "desc")) {
    return [{ createdAt: "desc" }];
  }
  const order = SORT_COLUMNS[column](dir);
  // createdAt tiebreak keeps pages stable when many rows share a sort value.
  return column === "createdAt" ? [order] : [order, { createdAt: "desc" }];
}
