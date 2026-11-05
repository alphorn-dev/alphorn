/**
 * "auto" extraction mode: recognizes well-known webhook sources by header or
 * payload shape and formats a readable notification per event type. Returns
 * null for unknown sources so the caller falls back to the generic heuristic.
 * Each source lives in ./sources/<name>.ts and is registered in ./sources/index.ts.
 */

import { SOURCES } from "./sources";
import type { AutoResult, Body } from "./sources/util";

export type { AutoResult };

/** `headers` keys must be lowercase (as produced by `Headers.forEach`). */
export function extractAuto(
  body: Body,
  headers: Record<string, string>
): AutoResult | null {
  const source = SOURCES.find((s) => s.detect(body, headers));
  return source ? source.extract(body, headers) : null;
}
