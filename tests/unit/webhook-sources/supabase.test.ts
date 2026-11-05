import { describe, it, expect } from "vitest";
import { supabaseSource } from "@/lib/webhook-extract/sources/supabase";

const insert = {
  type: "INSERT",
  table: "orders",
  schema: "public",
  record: { id: 42, customer_email: "alice@example.com", total: 100, status: "pending" },
  old_record: null,
};

const update = {
  type: "UPDATE",
  table: "orders",
  schema: "public",
  record: { id: "abc123", status: "shipped", total: 100, updated_at: "2026-01-02T00:00:00Z" },
  old_record: { id: "abc123", status: "pending", total: 100, updated_at: "2026-01-01T00:00:00Z" },
};

const del = {
  type: "DELETE",
  table: "users",
  schema: "auth",
  record: null,
  old_record: { id: "abc123", email: "bob@example.com" },
};

describe("supabaseSource", () => {
  it("detects Supabase database webhooks by payload shape only", () => {
    expect(supabaseSource.detect(insert, {})).toBe(true);
    expect(supabaseSource.detect(update, {})).toBe(true);
    expect(supabaseSource.detect(del, {})).toBe(true);
    expect(supabaseSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    expect(supabaseSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})).toBe(false);
    expect(supabaseSource.detect({ type: "INSERT", table: "orders", schema: "public" }, {})).toBe(false);
    expect(supabaseSource.detect({ type: "TRUNCATE", table: "orders", schema: "public", record: {} }, {})).toBe(false);
  });

  it("formats an INSERT without listing row values", () => {
    expect(supabaseSource.extract(insert, {})).toEqual({
      title: "INSERT on public.orders",
      message: "id: 42",
      priority: null,
      tags: ["supabase", "insert", "public", "orders"],
    });
  });

  it("lists only the changed columns on UPDATE", () => {
    expect(supabaseSource.extract(update, {})).toEqual({
      title: "UPDATE on public.orders",
      message: "id: abc123\nChanged: status, updated_at",
      priority: null,
      tags: ["supabase", "update", "public", "orders"],
    });
  });

  it("formats a DELETE from old_record", () => {
    expect(supabaseSource.extract(del, {})).toEqual({
      title: "DELETE on auth.users",
      message: "id: abc123",
      priority: null,
      tags: ["supabase", "delete", "auth", "users"],
    });
  });

  it("caps the changed column list at 10 names", () => {
    const many: Record<string, string> = {};
    const before: Record<string, string> = {};
    for (let i = 0; i < 15; i++) {
      many[`c${i}`] = "new";
      before[`c${i}`] = "old";
    }
    const result = supabaseSource.extract(
      { type: "UPDATE", table: "t", schema: "public", record: many, old_record: before },
      {}
    );
    expect(result.message.split("Changed: ")[1].split(", ")).toHaveLength(10);
  });

  it("does not throw on malformed payloads", () => {
    expect(() => supabaseSource.extract({ type: 5, table: null, schema: [], record: "x" }, {})).not.toThrow();
    expect(supabaseSource.extract({ type: "UPDATE", table: 3, record: { id: {} }, old_record: [] }, {})).toEqual({
      title: "Supabase UPDATE event",
      message: "Changed: id",
      priority: null,
      tags: ["supabase", "update"],
    });
  });
});
