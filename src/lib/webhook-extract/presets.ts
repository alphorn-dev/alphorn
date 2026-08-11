// Source presets: known third-party webhook payload shapes mapped to the four
// extraction template strings (title/message/tags/priority). Selecting a preset
// in the webhook UI pre-fills the template fields — it does not change the
// receiver hot path. Templates use the `{dotted.path}` syntax resolved by
// src/lib/webhook-extract/template.ts against the raw payload.
//
// Note: templates only substitute values, they cannot map strings to numbers,
// so priorityTemplate is only set where the payload carries a numeric-ish field.
// String-state severities (e.g. Alertmanager status "firing") are left to
// auto-detection until template value-mapping exists.

export interface SourcePreset {
  id: string;
  label: string;
  titleTemplate: string;
  messageTemplate: string;
  tagsTemplate: string;
  priorityTemplate: string;
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: "github",
    label: "GitHub",
    titleTemplate: "{action}: {repository.full_name}",
    messageTemplate: "{issue.title}{pull_request.title}",
    tagsTemplate: "github,{repository.name}",
    priorityTemplate: "",
  },
  {
    id: "grafana",
    label: "Grafana",
    titleTemplate: "{title}",
    messageTemplate: "{message}",
    tagsTemplate: "grafana,{state}",
    priorityTemplate: "",
  },
  {
    id: "alertmanager",
    label: "Prometheus Alertmanager",
    titleTemplate: "{commonAnnotations.summary}",
    messageTemplate: "{commonAnnotations.description}",
    tagsTemplate: "alertmanager,{status}",
    priorityTemplate: "",
  },
  {
    id: "sentry",
    label: "Sentry",
    titleTemplate: "{data.issue.title}",
    messageTemplate: "{data.issue.culprit}",
    tagsTemplate: "sentry,{data.issue.level}",
    priorityTemplate: "",
  },
  {
    id: "stripe",
    label: "Stripe",
    titleTemplate: "{type}",
    messageTemplate: "{data.object.description}",
    tagsTemplate: "stripe",
    priorityTemplate: "",
  },
];

export function getSourcePreset(id: string): SourcePreset | undefined {
  return SOURCE_PRESETS.find((p) => p.id === id);
}
