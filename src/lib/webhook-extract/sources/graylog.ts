// Graylog "HTTP Notification" alert payload (fixed JSON, legacy format).
// Docs: https://go2docs.graylog.org/current/interacting_with_your_log_data/notifications.html

import {
  str,
  num,
  list,
  lines,
  tags,
  excerpt,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// Graylog event priority: 1 low, 2 normal, 3 high.
const GRAYLOG_PRIORITY = new Map<number, number>([
  [3, 4],
  [2, 3],
  [1, 2],
]);

function graylog(body: Body): AutoResult {
  const definition = str(body, "event_definition_title") || "Graylog event";
  const message = str(body, "event.message");
  const source = str(body, "event.source");
  const type = str(body, "event_definition_type");
  // Backlog entries are raw log messages that may contain PII: count them, never dump them.
  const backlog = list(body, "backlog").length;
  const priority = num(body, "event.priority");

  return {
    title: `${definition}${message ? `: ${message}` : " triggered"}`,
    message: lines(
      excerpt(str(body, "event_definition_description")),
      source ? `Source: ${source}` : "",
      backlog ? `Backlog: ${backlog} message${backlog === 1 ? "" : "s"}` : ""
    ),
    priority: GRAYLOG_PRIORITY.get(priority ?? 0) ?? null,
    tags: tags("graylog", type.toLowerCase(), source.toLowerCase()),
  };
}

export const graylogSource: AutoSource = {
  id: "graylog",
  detect: (body) =>
    typeof body.event_definition_id === "string" &&
    typeof body.event_definition_title === "string" &&
    typeof body.event === "object" &&
    body.event !== null,
  extract: (body) => graylog(body),
};
