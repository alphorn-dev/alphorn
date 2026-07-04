import { resolveTemplate } from "./template";
import { extractHeuristic } from "./heuristic";

interface WebhookTemplates {
  titleTemplate: string | null;
  messageTemplate: string | null;
  tagsTemplate: string | null;
  priorityTemplate: string | null;
}

interface ExtractInput {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  templates: WebhookTemplates;
  /** Pre-normalized title/message (e.g. from a Slack-compatible payload) used instead of the generic heuristic guess when there's no template. */
  fallback?: { title: string | null; message: string };
}

interface ExtractResult {
  title: string | null;
  message: string;
  priority: number | null;
  tags: string[];
}

const TITLE_MAX = 200;
const MESSAGE_MAX = 4000;
const JSON_FALLBACK_INDENT = 2;

// Headers that may contain credentials, session state, or proxy internals.
// Stripped before exposing request headers to user-authored templates so a
// template like `{$headers.authorization}` cannot persist secrets into the
// Messages table.
const SENSITIVE_HEADER_PREFIXES = ["x-auth", "x-api"];
const SENSITIVE_HEADER_EXACT = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

function filterHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_EXACT.has(lower)) continue;
    if (SENSITIVE_HEADER_PREFIXES.some((p) => lower.startsWith(p))) continue;
    out[key] = value;
  }
  return out;
}

function buildContext(
  body: Record<string, unknown>,
  headers: Record<string, string>
): Record<string, unknown> {
  // `$headers` is a reserved key: the `$` prefix is not valid in template
  // placeholders ([a-zA-Z0-9_.] only), but `body` fields are spread first so
  // a literal `$headers` key in the body would still be shadowed here. Using
  // a reserved key makes the collision intentional rather than accidental.
  return { ...body, $headers: filterHeaders(headers) };
}

function resolveOrEmpty(
  template: string | null,
  context: Record<string, unknown>
): string {
  if (!template) return "";
  return resolveTemplate(template, context);
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parsePriority(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function extractFromPayload(input: ExtractInput): ExtractResult {
  const { body, headers, templates, fallback } = input;
  const context = buildContext(body, headers);

  const templatedTitle = resolveOrEmpty(templates.titleTemplate, context);
  const templatedMessage = resolveOrEmpty(templates.messageTemplate, context);
  const templatedTags = resolveOrEmpty(templates.tagsTemplate, context);
  const templatedPriority = resolveOrEmpty(templates.priorityTemplate, context);

  // The heuristic walks the whole body guessing at fields — skip it when
  // templates (plus, for title/message, the Slack fallback) already cover
  // everything, since it's wasted work on the hot webhook-receiving path.
  const needsHeuristic =
    (!templatedTitle && !fallback?.title) ||
    (!templatedMessage && !fallback?.message) ||
    !templatedTags ||
    !templatedPriority;
  const heuristic = needsHeuristic ? extractHeuristic(body) : null;

  const title = templatedTitle || fallback?.title || heuristic?.title || null;
  let message = templatedMessage || fallback?.message || heuristic?.message || "";

  if (message.length === 0) {
    message = JSON.stringify(body, null, JSON_FALLBACK_INDENT);
  }

  const tags = templatedTags ? parseTags(templatedTags) : (heuristic?.tags ?? []);
  const priority = templatedPriority
    ? parsePriority(templatedPriority)
    : (heuristic?.priority ?? null);

  return {
    title: title ? truncate(title, TITLE_MAX) : null,
    message: truncate(message, MESSAGE_MAX),
    priority,
    tags,
  };
}

/** Extracts notification fields from a non-JSON (e.g. text/plain) webhook body via X-Title/X-Priority/X-Tags headers. */
export function extractFromText(
  rawBody: string,
  headers: { get(name: string): string | null }
): ExtractResult {
  const title = headers.get("x-title") || null;
  const priorityHeader = headers.get("x-priority");
  let priority = priorityHeader ? parseInt(priorityHeader, 10) : null;
  if (priority !== null && Number.isNaN(priority)) priority = null;
  const tagsHeader = headers.get("x-tags");
  const tags = tagsHeader ? parseTags(tagsHeader) : [];

  return {
    title: title ? truncate(title, TITLE_MAX) : null,
    message: truncate(rawBody, MESSAGE_MAX),
    priority,
    tags,
  };
}
