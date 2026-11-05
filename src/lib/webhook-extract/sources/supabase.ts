// Supabase Database Webhooks (INSERT / UPDATE / DELETE on a table).
// Docs: https://supabase.com/docs/guides/database/webhooks
// No identifying header is sent, so detection is by payload shape.
// Row values are never included in the message (they may contain PII).

import {
  resolvePath,
  str,
  lines,
  tags,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

const SUPABASE_TYPES = ["INSERT", "UPDATE", "DELETE"];

function asRow(value: unknown): Body {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Body)
    : {};
}

// Columns whose value differs between the old and new row (UPDATE only).
function changedColumns(body: Body): string[] {
  const after = asRow(body.record);
  const before = asRow(body.old_record);
  const columns = new Set([...Object.keys(after), ...Object.keys(before)]);
  return [...columns].filter(
    (c) => JSON.stringify(after[c]) !== JSON.stringify(before[c])
  );
}

function supabase(body: Body): AutoResult {
  const type = str(body, "type");
  const schema = str(body, "schema");
  const table = str(body, "table");
  const rawId = resolvePath(body, "record.id") ?? resolvePath(body, "old_record.id");
  const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
  const changed = type === "UPDATE" ? changedColumns(body) : [];

  return {
    title: table ? `${type} on ${schema ? `${schema}.` : ""}${table}` : `Supabase ${type || "database"} event`,
    message: lines(
      id ? `id: ${id}` : "",
      changed.length > 0 ? `Changed: ${changed.slice(0, MAX_LIST_ITEMS).join(", ")}` : ""
    ),
    priority: null,
    tags: tags("supabase", type.toLowerCase(), schema.toLowerCase(), table.toLowerCase()),
  };
}

export const supabaseSource: AutoSource = {
  id: "supabase",
  detect: (body) =>
    SUPABASE_TYPES.includes(str(body, "type")) &&
    typeof body.table === "string" &&
    typeof body.schema === "string" &&
    ("record" in body || "old_record" in body),
  extract: (body) => supabase(body),
};
