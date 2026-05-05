/**
 * Heuristic extraction of notification fields from an arbitrary JSON
 * payload. Used when the webhook has no explicit template and the body
 * is not a Slack-compatible or native Alphorn payload.
 *
 * Strategy: walk the top level plus one level of common wrapper keys
 * (issue, pull_request, data, event, submission, object) and pick the
 * first string-valued field from an ordered list of candidate keys,
 * separately for title and message.
 */

const WRAPPER_KEYS = [
  "issue",
  "pull_request",
  "data",
  "event",
  "submission",
  "object",
  "payload",
  "form_response",
];

const TITLE_KEYS = ["title", "subject", "name", "headline"];
const MESSAGE_KEYS = [
  "message",
  "body",
  "msg",
  "text",
  "content",
  "description",
  "summary",
];

interface HeuristicResult {
  title: string | null;
  message: string;
  priority: number | null;
  tags: string[];
}

function scopes(body: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [body];
  for (const key of WRAPPER_KEYS) {
    const value = body[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(value as Record<string, unknown>);
    }
  }
  return out;
}

function findString(
  body: Record<string, unknown>,
  keys: string[],
  exclude: { scope: Record<string, unknown>; key: string } | null
): { value: string; scope: Record<string, unknown>; key: string } | null {
  for (const scope of scopes(body)) {
    for (const key of keys) {
      if (exclude && exclude.scope === scope && exclude.key === key) continue;
      const value = scope[key];
      if (typeof value === "string" && value.length > 0) {
        return { value, scope, key };
      }
    }
  }
  return null;
}

function extractPriority(body: Record<string, unknown>): number | null {
  const raw = body.priority;
  return typeof raw === "number" ? Math.round(raw) : null;
}

function extractTags(body: Record<string, unknown>): string[] {
  const raw = body.tags;
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === "string");
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

export function extractHeuristic(
  body: Record<string, unknown>
): HeuristicResult {
  const titleHit = findString(body, TITLE_KEYS, null);
  const messageHit = findString(
    body,
    MESSAGE_KEYS,
    titleHit ? { scope: titleHit.scope, key: titleHit.key } : null
  );

  let title: string | null = titleHit ? titleHit.value : null;

  // Prefix GitHub-style `action` when present at the top level.
  const action = body.action;
  if (titleHit && typeof action === "string" && action.length > 0) {
    title = `${action}: ${titleHit.value}`;
  }

  return {
    title,
    message: messageHit ? messageHit.value : "",
    priority: extractPriority(body),
    tags: extractTags(body),
  };
}
