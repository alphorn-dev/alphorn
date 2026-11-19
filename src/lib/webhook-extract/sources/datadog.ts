// Datadog Webhooks integration, default payload (Payload field left empty):
// { id, title, body, event_type, date, last_updated, org: { id, name } },
// every value rendered as a string.
// Docs: https://docs.datadoghq.com/integrations/webhooks/
// The payload is user-editable, so custom payloads may not be detected.

import {
  str,
  excerpt,
  lookup,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// The default payload has no status field: monitor events carry the transition
// as a title prefix, e.g. "[Triggered on {host:web-1}] High CPU".
const TRANSITION_PATTERN = /^\[(?:Re-)?(Triggered|Recovered|Warn|No Data)\b/i;

const TRANSITION_PRIORITY: Record<string, number> = {
  triggered: 4,
  "no-data": 4,
  warn: 3,
  recovered: 2,
};

function datadog(body: Body): AutoResult {
  const title = str(body, "title");
  const transition = (TRANSITION_PATTERN.exec(title)?.[1] ?? "")
    .toLowerCase()
    .replace(" ", "-");

  return {
    title: title || "Datadog event",
    // Event text is markdown wrapped in %%% markers.
    message: excerpt(str(body, "body").replace(/^\s*%%%|%%%\s*$/g, "")),
    priority: lookup(TRANSITION_PRIORITY, transition) ?? null,
    tags: tags("datadog", str(body, "event_type"), transition),
  };
}

export const datadogSource: AutoSource = {
  id: "datadog",
  // Payload shape only: Datadog sends no vendor-specific headers.
  detect: (body) =>
    "last_updated" in body &&
    str(body, "event_type") !== "" &&
    str(body, "org.id") !== "",
  extract: (body) => datadog(body),
};
