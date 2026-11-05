import {
  resolvePath,
  str,
  lines,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

const SENTRY_LEVEL_PRIORITY: Record<string, number> = {
  fatal: 5,
  error: 4,
  warning: 3,
  info: 2,
  debug: 1,
};

function sentry(resource: string, body: Body): AutoResult {
  const action = str(body, "action");
  const base = { tags: tags("sentry", resource) };

  if (resource === "metric_alert") {
    const priority = action === "critical" ? 5 : action === "warning" ? 4 : 2;
    return {
      ...base,
      title: str(body, "data.description_title") || `Metric alert ${action}`,
      message: lines(str(body, "data.description_text"), str(body, "data.web_url")),
      priority,
    };
  }

  // "issue" carries data.issue, "event_alert" and "error" carry data.event.
  const item = resolvePath(body, "data.issue") ?? resolvePath(body, "data.event");
  const level = str(item, "level");
  const rule = str(body, "data.triggered_rule");
  const title = str(item, "title") || `${resource} ${action}`;
  return {
    ...base,
    tags: tags("sentry", resource, level),
    title: rule ? `${rule}: ${title}` : resource === "issue" ? `Issue ${action}: ${title}` : title,
    message: lines(
      str(item, "culprit"),
      str(item, "web_url") || str(item, "permalink") || str(item, "url")
    ),
    priority: lookup(SENTRY_LEVEL_PRIORITY, level) ?? null,
  };
}

export const sentrySource: AutoSource = {
  id: "sentry",
  detect: (_body, headers) => Boolean(headers["sentry-hook-resource"]),
  extract: (body, headers) => sentry(headers["sentry-hook-resource"], body),
};
