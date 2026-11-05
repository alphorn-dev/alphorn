// Source presets: known third-party webhook payload shapes mapped to the four
// extraction template strings (title/message/tags/priority). Selecting a preset
// in the webhook UI pre-fills the template fields and sets extractMode to
// "template"; the preset id itself is not stored. Templates cannot branch, so
// GitHub has one preset per event type; "auto" mode (./auto.ts) handles all
// GitHub events in one webhook. Templates use the `{dotted.path}` syntax resolved by
// src/lib/webhook-extract/template.ts against the raw payload.
//
// Note: templates only substitute values, they cannot map strings to numbers,
// so priorityTemplate is only set where the payload carries a numeric-ish field.
// String-state severities (e.g. Alertmanager status "firing") are left to
// auto-detection until template value-mapping exists.

export const EXTRACT_MODES = ["auto", "none", "template"] as const;
export type ExtractMode = (typeof EXTRACT_MODES)[number];

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
    id: "github-pull-request",
    label: "GitHub: Pull requests",
    titleTemplate:
      "[{repository.full_name}] PR #{pull_request.number} {action}: {pull_request.title}",
    messageTemplate: "{sender.login} {action} pull request #{pull_request.number}\n{pull_request.html_url}",
    tagsTemplate: "github,pull_request,{repository.name}",
    priorityTemplate: "",
  },
  {
    id: "github-issues",
    label: "GitHub: Issues",
    titleTemplate: "[{repository.full_name}] Issue #{issue.number} {action}: {issue.title}",
    messageTemplate: "{sender.login} {action} issue #{issue.number}\n{issue.html_url}",
    tagsTemplate: "github,issues,{repository.name}",
    priorityTemplate: "",
  },
  {
    id: "github-issue-comment",
    label: "GitHub: Issue/PR comments",
    titleTemplate: "[{repository.full_name}] New comment on #{issue.number}: {issue.title}",
    messageTemplate: "{comment.user.login}: {comment.body}\n{comment.html_url}",
    tagsTemplate: "github,issue_comment,{repository.name}",
    priorityTemplate: "",
  },
  {
    id: "github-push",
    label: "GitHub: Push",
    titleTemplate: "[{repository.full_name}] {pusher.name} pushed to {ref}",
    messageTemplate: "{head_commit.message}\n{compare}",
    tagsTemplate: "github,push,{repository.name}",
    priorityTemplate: "",
  },
  {
    id: "github-release",
    label: "GitHub: Releases",
    titleTemplate: "[{repository.full_name}] Release {release.tag_name} {action}",
    messageTemplate: "{release.name}\n{release.html_url}",
    tagsTemplate: "github,release,{repository.name}",
    priorityTemplate: "",
  },
  {
    id: "github-workflow-run",
    label: "GitHub: Workflow runs",
    titleTemplate:
      "[{repository.full_name}] {workflow_run.name} {workflow_run.status} {workflow_run.conclusion}",
    messageTemplate:
      "{workflow_run.head_branch} by {workflow_run.actor.login}\n{workflow_run.html_url}",
    tagsTemplate: "github,workflow_run,{repository.name}",
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
