// Jira Cloud webhooks. Docs: https://developer.atlassian.com/cloud/jira/platform/webhooks/
// Every delivery carries X-Atlassian-Webhook-Identifier. The payload has
// webhookEvent ("jira:issue_created", "comment_created", ...), user, issue, and
// changelog (issue_updated only).
import {
  str,
  list,
  lines,
  tags,
  excerpt,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

const EVENT_LABELS: Record<string, string> = {
  issue_created: "created",
  issue_updated: "updated",
  issue_deleted: "deleted",
  comment_created: "comment added",
  comment_updated: "comment updated",
  comment_deleted: "comment deleted",
  worklog_created: "worklog added",
  worklog_updated: "worklog updated",
  worklog_deleted: "worklog deleted",
};

function jiraPriority(name: string): number | null {
  if (name === "Highest") return 5;
  if (name === "High") return 4;
  return null;
}

// "https://example.atlassian.net/rest/api/2/issue/10001" → ".../browse/PROJ-12"
function browseUrl(self: string, key: string): string {
  const origin = self.match(/^https?:\/\/[^/]+/)?.[0];
  return origin && key ? `${origin}/browse/${key}` : "";
}

function jira(body: Body): AutoResult {
  const event = str(body, "webhookEvent");
  const shortEvent = event.replace(/^jira:/, "");
  const key = str(body, "issue.key");
  const summary = str(body, "issue.fields.summary");
  const status = str(body, "issue.fields.status.name");
  const label = lookup(EVENT_LABELS, shortEvent) || shortEvent.replace(/_/g, " ") || "event";
  const head = key ? `${key} ${label}` : `Jira ${label}`;

  const changes = list(body, "changelog.items");
  const changeLines = changes.slice(0, MAX_LIST_ITEMS).map(
    (c) => `- ${str(c, "field")}: ${str(c, "fromString") || "none"} → ${str(c, "toString") || "none"}`
  );
  if (changes.length > MAX_LIST_ITEMS) {
    changeLines.push(`… and ${changes.length - MAX_LIST_ITEMS} more`);
  }

  const actor = str(body, "user.displayName");
  return {
    title: `${head}${summary ? `: ${summary}` : ""}`,
    message: lines(
      actor ? `By ${actor}` : "",
      ...changeLines,
      excerpt(str(body, "comment.body")),
      browseUrl(str(body, "issue.self"), key)
    ),
    priority: jiraPriority(str(body, "issue.fields.priority.name")),
    tags: tags("jira", shortEvent, key.split("-")[0].toLowerCase(), status.toLowerCase()),
  };
}

export const jiraSource: AutoSource = {
  id: "jira",
  detect: (body, headers) =>
    // Other Atlassian products send this header too, so require a Jira event name.
    (Boolean(headers["x-atlassian-webhook-identifier"]) && str(body, "webhookEvent") !== "") ||
    (/^(jira:|comment_|worklog_)/.test(str(body, "webhookEvent")) &&
      typeof body.issue === "object" &&
      body.issue !== null),
  extract: (body) => jira(body),
};
