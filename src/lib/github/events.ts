// Client-safe (no node imports): used by the event picker and the server.

/**
 * Events the App subscribes to and users can pick per connection, grouped for the UI.
 * Each needs the matching read permission on the GitHub App (docs: /github-app).
 */
export const GITHUB_EVENTS = [
  { id: "push", label: "Pushes", group: "Code" },
  { id: "create", label: "Branch or tag created", group: "Code" },
  { id: "delete", label: "Branch or tag deleted", group: "Code" },
  { id: "release", label: "Releases", group: "Code" },
  { id: "commit_comment", label: "Commit comments", group: "Code" },
  { id: "pull_request", label: "Pull requests", group: "Pull requests" },
  { id: "pull_request_review", label: "Pull request reviews", group: "Pull requests" },
  { id: "pull_request_review_comment", label: "Pull request review comments", group: "Pull requests" },
  { id: "issues", label: "Issues", group: "Issues and discussions" },
  { id: "issue_comment", label: "Issue and pull request comments", group: "Issues and discussions" },
  { id: "discussion", label: "Discussions", group: "Issues and discussions" },
  { id: "discussion_comment", label: "Discussion comments", group: "Issues and discussions" },
  { id: "workflow_run", label: "Workflow runs", group: "CI/CD" },
  { id: "deployment_status", label: "Deployments", group: "CI/CD" },
  { id: "deployment_review", label: "Deployment approvals", group: "CI/CD" },
  { id: "secret_scanning_alert", label: "Secret scanning alerts", group: "Security" },
  { id: "dependabot_alert", label: "Dependabot alerts", group: "Security" },
  { id: "code_scanning_alert", label: "Code scanning alerts", group: "Security" },
  { id: "repository_advisory", label: "Security advisories", group: "Security" },
  { id: "star", label: "Stars", group: "Community" },
  { id: "fork", label: "Forks", group: "Community" },
] as const;

export type GithubEvent = (typeof GITHUB_EVENTS)[number]["id"];
export const GITHUB_EVENT_IDS = GITHUB_EVENTS.map((e) => e.id) as [GithubEvent, ...GithubEvent[]];

/**
 * Actions that become a message, per event. GitHub sends one delivery per action, so one
 * release arrives as created + published + released, one workflow run as requested +
 * in_progress + completed. Events not listed here (push, fork, ...) pass unfiltered.
 * ponytail: allow-list, so actions GitHub adds later are dropped until listed here.
 */
const RELEVANT_ACTIONS: Partial<Record<GithubEvent, readonly string[]>> = {
  release: ["published"],
  pull_request: ["opened", "closed", "reopened", "ready_for_review"],
  pull_request_review: ["submitted", "dismissed"],
  pull_request_review_comment: ["created"],
  issues: ["opened", "closed", "reopened"],
  issue_comment: ["created"],
  discussion: ["created", "answered", "closed", "reopened"],
  discussion_comment: ["created"],
  workflow_run: ["completed"],
  // Assignment changes are dropped; appeared_in_branch repeats an existing alert per branch.
  secret_scanning_alert: ["created", "reopened", "publicly_leaked", "resolved", "validated"],
  dependabot_alert: ["created", "reopened", "auto_reopened", "reintroduced", "fixed", "dismissed", "auto_dismissed"],
  code_scanning_alert: ["created", "reopened", "reopened_by_user", "fixed", "closed_by_user"],
  star: ["created"],
};

// deployment_status always has action "created"; the noise is in the state
// (queued, pending, in_progress, ... before the outcome, inactive when superseded).
const FINAL_DEPLOYMENT_STATES = ["success", "failure", "error"];

export function isRelevantGithubEvent(
  event: string,
  payload: { action?: string; deployment_status?: { state: string } }
): boolean {
  if (event === "deployment_status") {
    return FINAL_DEPLOYMENT_STATES.includes(payload.deployment_status?.state ?? "");
  }
  const actions = RELEVANT_ACTIONS[event as GithubEvent];
  return !actions || actions.includes(payload.action ?? "");
}

export const DEFAULT_GITHUB_EVENTS: GithubEvent[] = [
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "issues",
  "issue_comment",
  // Rare and urgent; Dependabot and code scanning are opt-in (enabling them can flood).
  "secret_scanning_alert",
  "repository_advisory",
];
