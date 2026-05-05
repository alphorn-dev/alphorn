const SUBJECT_MAX = 100;

/**
 * Derive a subject line for protocols that require one (email, alerting).
 * Falls back to the first non-empty line of the message, truncated.
 */
export function subjectFallback(
  title: string | null,
  message: string
): string {
  if (title) return title;
  const firstLine = message.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (!firstLine) return "Notification";
  return firstLine.length > SUBJECT_MAX
    ? firstLine.slice(0, SUBJECT_MAX - 1) + "…"
    : firstLine;
}
