// Client-safe (no node imports): used by the event picker and the server.

/** Events the App subscribes to and users can pick per connection (labels for the UI). */
export const GITHUB_EVENTS = [
  { id: "pull_request", label: "Pull requests" },
  { id: "pull_request_review", label: "Pull request reviews" },
  { id: "pull_request_review_comment", label: "Pull request review comments" },
  { id: "issues", label: "Issues" },
  { id: "issue_comment", label: "Issue and pull request comments" },
  { id: "push", label: "Pushes" },
  { id: "release", label: "Releases" },
  { id: "workflow_run", label: "Workflow runs" },
  { id: "create", label: "Branch or tag created" },
  { id: "delete", label: "Branch or tag deleted" },
  { id: "commit_comment", label: "Commit comments" },
  { id: "star", label: "Stars" },
  { id: "fork", label: "Forks" },
] as const;

export type GithubEvent = (typeof GITHUB_EVENTS)[number]["id"];
export const GITHUB_EVENT_IDS = GITHUB_EVENTS.map((e) => e.id) as [GithubEvent, ...GithubEvent[]];

export const DEFAULT_GITHUB_EVENTS: GithubEvent[] = [
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "issues",
  "issue_comment",
];
