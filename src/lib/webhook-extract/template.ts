/**
 * Minimal `{dotted.path}` template resolver used by webhook extraction.
 * Intentionally has no conditionals, loops, or helpers — users cannot
 * write logic into templates. Missing paths render as empty string.
 */

export function resolvePath(obj: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

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
