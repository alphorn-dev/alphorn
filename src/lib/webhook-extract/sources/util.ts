// Shared helpers for source formatters. Payloads are untrusted: read every
// field through `str`/`num`/`list`, which only accept the expected type, so a
// malformed payload degrades to missing text instead of throwing.

import { resolvePath } from "@/lib/safe-path";

export { resolvePath };

export type Body = Record<string, unknown>;

export interface AutoResult {
  title: string;
  message: string;
  priority: number | null;
  tags: string[];
}

export const MAX_LIST_ITEMS = 10;
export const MAX_BODY_EXCERPT = 500;

export function str(obj: unknown, path: string): string {
  const value = resolvePath(obj, path);
  return typeof value === "string" ? value : "";
}

export function num(obj: unknown, path: string): number | null {
  const value = resolvePath(obj, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function list(obj: unknown, path: string): unknown[] {
  const value = resolvePath(obj, path);
  return Array.isArray(value) ? value : [];
}

export function excerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_BODY_EXCERPT
    ? `${trimmed.slice(0, MAX_BODY_EXCERPT)}…`
    : trimmed;
}

export function lines(...parts: string[]): string {
  return parts.filter(Boolean).join("\n");
}

/** Own-key lookup: untrusted keys like "constructor" must not hit Object.prototype. */
export function lookup<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function tags(...values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * A known webhook source. `detect` must be cheap and specific: sources are
 * tried in order (see ./index.ts) and the first match wins.
 * `headers` keys are lowercase.
 */
export interface AutoSource {
  id: string;
  detect(body: Body, headers: Record<string, string>): boolean;
  extract(body: Body, headers: Record<string, string>): AutoResult;
}
