// Overseerr / Jellyseerr (Seerr) webhook agent, default JSON payload template.
// Docs: https://docs.seerr.dev/using-overseerr/notifications/webhooks
// Template: https://github.com/sct/overseerr/blob/develop/src/components/Settings/Notifications/NotificationsWebhook/index.tsx

import {
  str,
  lines,
  tags,
  excerpt,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// Map, not a plain object: notification_type is untrusted, so keys like
// "constructor" must not hit Object.prototype.
const PRIORITY = new Map<string, number>([
  ["MEDIA_FAILED", 4],
  ["ISSUE_CREATED", 4],
  ["ISSUE_RESOLVED", 2],
]);

function overseerr(body: Body): AutoResult {
  const type = str(body, "notification_type");
  const event = str(body, "event") || `Overseerr ${type.replace(/_/g, " ").toLowerCase()}`;
  const subject = str(body, "subject");
  // The comment author beats the issue reporter when both are present.
  const actor =
    str(body, "comment.commentedBy_username") ||
    str(body, "request.requestedBy_username") ||
    str(body, "issue.reportedBy_username");
  return {
    title: subject ? `${event}: ${subject}` : event,
    message: lines(
      excerpt(str(body, "message")),
      excerpt(str(body, "comment.comment_message")),
      actor ? `by ${actor}` : ""
    ),
    priority: PRIORITY.get(type) ?? null,
    tags: tags("overseerr", type.toLowerCase(), str(body, "media.media_type")),
  };
}

export const overseerrSource: AutoSource = {
  id: "overseerr",
  // Default template keys: notification_type + subject, plus the media or request object.
  detect: (body) =>
    typeof body.notification_type === "string" &&
    typeof body.subject === "string" &&
    ("media" in body || "request" in body),
  extract: (body) => overseerr(body),
};
