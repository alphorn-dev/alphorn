/**
 * Slack-compatible webhook payload normalization.
 *
 * Slack's incoming webhook format uses `text`, `blocks`, and `attachments`
 * instead of our native `message`/`title` fields. This module detects
 * Slack-formatted payloads and converts them to our internal format so
 * users can point Slack-compatible tools at Alphorn without changes.
 *
 * @see https://api.slack.com/reference/messaging/payload
 */

interface SlackAttachment {
  fallback?: string;
  text?: string;
  pretext?: string;
  title?: string;
}

interface SlackBlock {
  type: string;
  text?: { text?: string };
}

interface SlackPayload {
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

interface NormalizedMessage {
  title: string | null;
  message: string;
}

/**
 * Returns true if the body looks like a Slack webhook payload rather than
 * our native format. A payload is considered Slack-formatted when it has
 * at least one Slack-specific field (`text`, `blocks`, `attachments`) and
 * none of our native message fields (`message`, `body`, `msg`).
 */
export function isSlackPayload(body: Record<string, unknown>): boolean {
  const hasNativeField = "message" in body || "body" in body || "msg" in body;
  const hasSlackField = "text" in body || "blocks" in body || "attachments" in body;
  return !hasNativeField && hasSlackField;
}

/**
 * Extracts a title and message from a Slack-formatted payload.
 *
 * Resolution order:
 *   1. `text`  — the primary Slack message field
 *   2. Section blocks — concatenated text from Block Kit sections
 *   3. Attachments — first non-empty `fallback`, `text`, or `pretext`
 *
 * Title is taken from the first attachment's `title` if present.
 */
export function normalizeSlackPayload(body: Record<string, unknown>): NormalizedMessage {
  const slack = body as SlackPayload;

  const message = extractText(slack) || extractBlockText(slack) || extractAttachmentText(slack) || "";
  const title = extractAttachmentTitle(slack) || null;

  return { title, message };
}

function extractText(slack: SlackPayload): string | undefined {
  return typeof slack.text === "string" && slack.text ? slack.text : undefined;
}

function extractBlockText(slack: SlackPayload): string | undefined {
  if (!Array.isArray(slack.blocks)) return undefined;

  const texts = slack.blocks
    .filter((b) => b.type === "section" && typeof b.text?.text === "string")
    .map((b) => b.text!.text!);

  return texts.length > 0 ? texts.join("\n") : undefined;
}

function extractAttachmentText(slack: SlackPayload): string | undefined {
  if (!Array.isArray(slack.attachments)) return undefined;

  for (const att of slack.attachments) {
    const text = att.fallback || att.text || att.pretext;
    if (text) return text;
  }
  return undefined;
}

function extractAttachmentTitle(slack: SlackPayload): string | undefined {
  if (!Array.isArray(slack.attachments)) return undefined;

  for (const att of slack.attachments) {
    if (typeof att.title === "string" && att.title) return att.title;
  }
  return undefined;
}
