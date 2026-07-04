/**
 * Minimal `{dotted.path}` template resolver used by webhook extraction.
 * Intentionally has no conditionals, loops, or helpers — users cannot
 * write logic into templates. Missing paths render as empty string.
 */

import { resolvePath } from "@/lib/safe-path";

const PLACEHOLDER = /\{(\$?[a-zA-Z0-9_.]+)\}/g;

export function resolveTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(PLACEHOLDER, (_match, path: string) => {
    const value = resolvePath(context, path);
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  });
}
