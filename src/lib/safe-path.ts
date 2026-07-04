const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Resolve a dotted path against an untrusted object (webhook payloads, filter
 * targets). Blocks prototype-chain keys and only follows own properties, so a
 * malicious payload can't be used to read off Object.prototype.
 */
export function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (BLOCKED_KEYS.has(key)) return undefined;
    if (
      current !== null &&
      typeof current === "object" &&
      Object.prototype.hasOwnProperty.call(current, key)
    ) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
