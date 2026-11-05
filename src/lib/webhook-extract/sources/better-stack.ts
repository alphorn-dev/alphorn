// Better Stack Uptime incident webhooks, default "incident_change" template:
// { data: { id, type: "incident", attributes: { name, url, cause, started_at,
// acknowledged_at, resolved_at, ... } } }. Comment events add a top-level
// `event: "comment"` and a `comment` object.
// Source: https://betterstack.com/docs/uptime/webhooks/
// The body template is user-editable, so custom templates may not be detected.

import {
  resolvePath,
  str,
  lines,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

function betterStack(body: Body): AutoResult {
  const name = str(body, "data.attributes.name");
  const url = str(body, "data.attributes.url");
  const startedAt = str(body, "data.attributes.started_at");
  const ackAt = str(body, "data.attributes.acknowledged_at");
  const resolvedAt = str(body, "data.attributes.resolved_at");

  const status =
    str(body, "event") === "comment"
      ? "comment"
      : resolvedAt
        ? "resolved"
        : ackAt
          ? "acknowledged"
          : "started";
  const suffix = name ? `: ${name}` : "";

  return {
    title: status === "comment" ? `Comment on incident${suffix}` : `Incident ${status}${suffix}`,
    message:
      status === "comment"
        ? lines(str(body, "comment.attributes.content"), url)
        : lines(
            str(body, "data.attributes.cause"),
            url,
            startedAt && `Started at ${startedAt}`,
            ackAt && `Acknowledged at ${ackAt}`,
            resolvedAt && `Resolved at ${resolvedAt}`
          ),
    priority: status === "started" ? 4 : status === "resolved" ? 2 : null,
    tags: tags("better-stack", "incident", status),
  };
}

export const betterStackSource: AutoSource = {
  id: "better-stack",
  // Payload shape only: the default template sends no vendor-specific headers.
  detect: (body) => {
    const attrs = resolvePath(body, "data.attributes");
    return (
      str(body, "data.type") === "incident" &&
      typeof attrs === "object" &&
      attrs !== null &&
      ("cause" in attrs || "started_at" in attrs)
    );
  },
  extract: (body) => betterStack(body),
};
