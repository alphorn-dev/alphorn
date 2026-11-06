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
