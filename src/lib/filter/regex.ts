import { RE2JS } from "re2js";

/**
 * Compile a user-supplied filter regex with RE2 semantics: matching is linear
 * in the input length, so no pattern can backtrack catastrophically (the
 * receiver evaluates filters synchronously on the hot path). Backreferences
 * and lookarounds are not supported and yield null.
 */
export function compileFilterRegex(pattern: string): RE2JS | null {
  try {
    return RE2JS.compile(pattern, RE2JS.CASE_INSENSITIVE);
  } catch {
    return null;
  }
}
