/**
 * "auto" extraction mode: recognizes well-known webhook sources by header or
 * payload shape and formats a readable notification per event type. Returns
 * null for unknown sources so the caller falls back to the generic heuristic.
 *
 * Payloads are untrusted: every field is read through `str`/`num`, which only
 * accept the expected primitive type, so a malformed payload degrades to
 * missing text instead of throwing.
 */

import { resolvePath } from "@/lib/safe-path";

type Body = Record<string, unknown>;

export interface AutoResult {
  title: string;
  message: string;
  priority: number | null;
  tags: string[];
}

const MAX_LIST_ITEMS = 10;
const MAX_BODY_EXCERPT = 500;

function str(obj: unknown, path: string): string {
  const value = resolvePath(obj, path);
  return typeof value === "string" ? value : "";
}

function num(obj: unknown, path: string): number | null {
  const value = resolvePath(obj, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function list(obj: unknown, path: string): unknown[] {
  const value = resolvePath(obj, path);
  return Array.isArray(value) ? value : [];
}

function excerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_BODY_EXCERPT
    ? `${trimmed.slice(0, MAX_BODY_EXCERPT)}…`
    : trimmed;
}

function lines(...parts: string[]): string {
  return parts.filter(Boolean).join("\n");
}

function tags(...values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

// ---------------------------------------------------------------- GitHub

function github(event: string, body: Body): AutoResult {
  const repo = str(body, "repository.full_name");
  const prefix = repo ? `[${repo}] ` : "";
  const action = str(body, "action");
  const sender = str(body, "sender.login");
  const baseTags = tags("github", event, str(body, "repository.name"));
  const result = (title: string, message: string, priority: number | null = null) => ({
    title: prefix + title,
    message,
    priority,
    tags: baseTags,
  });

  switch (event) {
    case "ping":
      return result("Webhook connected", lines(str(body, "zen"), str(body, "hook.config.url")));

    case "push": {
      const ref = str(body, "ref");
      const isTag = ref.startsWith("refs/tags/");
      const name = ref.replace(/^refs\/(heads|tags)\//, "");
      const pusher = str(body, "pusher.name") || sender;
      if (body.deleted === true) {
        return result(`${pusher} deleted ${isTag ? "tag" : "branch"} ${name}`, "");
      }
      const commits = list(body, "commits");
      const commitLines = commits.slice(0, MAX_LIST_ITEMS).map((c) => {
        const sha = str(c, "id").slice(0, 7);
        const msg = str(c, "message").split("\n")[0];
        const author = str(c, "author.username") || str(c, "author.name");
        return `- ${sha} ${msg}${author ? ` (${author})` : ""}`;
      });
      if (commits.length > MAX_LIST_ITEMS) {
        commitLines.push(`… and ${commits.length - MAX_LIST_ITEMS} more`);
      }
      const what = isTag
        ? `tag ${name}`
        : `${commits.length} commit${commits.length === 1 ? "" : "s"} to ${name}`;
      return result(`${pusher} pushed ${what}`, lines(...commitLines, str(body, "compare")));
    }

    case "pull_request": {
      const pr = body.pull_request;
      const merged = action === "closed" && resolvePath(pr, "merged") === true;
      const verb = merged ? "merged" : action;
      const number = num(pr, "number");
      const branches =
        str(pr, "head.ref") && str(pr, "base.ref")
          ? `${str(pr, "head.ref")} → ${str(pr, "base.ref")}`
          : "";
      return result(
        `PR #${number} ${verb}: ${str(pr, "title")}`,
        lines(
          `${sender} ${verb} pull request #${number}${branches ? ` (${branches})` : ""}`,
          action === "opened" ? excerpt(str(pr, "body")) : "",
          str(pr, "html_url")
        )
      );
    }

    case "pull_request_review": {
      const state = str(body, "review.state").replace(/_/g, " ").toLowerCase();
      return result(
        `PR #${num(body, "pull_request.number")} review ${state}: ${str(body, "pull_request.title")}`,
        lines(
          `${str(body, "review.user.login") || sender} ${state} the pull request`,
          excerpt(str(body, "review.body")),
          str(body, "review.html_url")
        )
      );
    }

    case "pull_request_review_comment":
    case "issue_comment":
    case "commit_comment": {
      const target =
        event === "commit_comment"
          ? `commit ${str(body, "comment.commit_id").slice(0, 7)}`
          : event === "pull_request_review_comment"
            ? `PR #${num(body, "pull_request.number")}: ${str(body, "pull_request.title")}`
            : `${resolvePath(body, "issue.pull_request") ? "PR" : "issue"} #${num(body, "issue.number")}: ${str(body, "issue.title")}`;
      return result(
        `Comment ${action || "created"} on ${target}`,
        lines(
          `${str(body, "comment.user.login") || sender}: ${excerpt(str(body, "comment.body"))}`,
          str(body, "comment.html_url")
        )
      );
    }

    case "issues":
      return result(
        `Issue #${num(body, "issue.number")} ${action}: ${str(body, "issue.title")}`,
        lines(
          `${sender} ${action} issue #${num(body, "issue.number")}`,
          action === "opened" ? excerpt(str(body, "issue.body")) : "",
          str(body, "issue.html_url")
        )
      );

    case "release": {
      const tag = str(body, "release.tag_name");
      const name = str(body, "release.name");
      return result(
        `Release ${tag} ${action}`,
        lines(
          name && name !== tag ? name : "",
          excerpt(str(body, "release.body")),
          str(body, "release.html_url")
        )
      );
    }

    case "workflow_run": {
      const run = body.workflow_run;
      const conclusion = str(run, "conclusion");
      const state = conclusion || str(run, "status") || action;
      const failed = ["failure", "timed_out", "startup_failure"].includes(conclusion);
      return result(
        `Workflow "${str(run, "name")}" ${state.replace(/_/g, " ")} on ${str(run, "head_branch")}`,
        lines(
          `${str(run, "display_title")} (by ${str(run, "actor.login") || sender})`,
          str(run, "html_url")
        ),
        failed ? 4 : null
      );
    }

    case "create":
    case "delete":
      return result(
        `${sender} ${event === "create" ? "created" : "deleted"} ${str(body, "ref_type")} ${str(body, "ref")}`,
        ""
      );

    case "star":
      return result(
        `${sender} ${action === "deleted" ? "unstarred" : "starred"} the repository`,
        `${num(body, "repository.stargazers_count") ?? "?"} stars`
      );

    case "fork":
      return result(`${sender} forked the repository`, str(body, "forkee.html_url"));

    default:
      return result(
        `${event.replace(/_/g, " ")}${action ? ` ${action}` : ""}`,
        sender ? `by ${sender}` : ""
      );
  }
}

// ---------------------------------------------------------------- Sentry

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
    priority: SENTRY_LEVEL_PRIORITY[level] ?? null,
  };
}

// ---------------------------------------------------------------- Stripe

function formatAmount(amount: number, currency: string): string {
  try {
    const formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    });
    // Stripe amounts are in the currency's minor unit (cents, or whole yen).
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** digits);
  } catch {
    // Unknown ISO code from an untrusted payload.
    return `${amount} ${currency}`;
  }
}

function stripe(body: Body): AutoResult {
  const type = str(body, "type");
  const obj = resolvePath(body, "data.object");
  const amount = num(obj, "amount") ?? num(obj, "amount_due") ?? num(obj, "amount_total");
  const currency = str(obj, "currency");
  const failed = /failed|dispute|past_due/.test(type);
  return {
    title: `Stripe: ${type.replace(/[._]/g, " ")}`,
    message: lines(
      amount !== null && currency ? formatAmount(amount, currency) : "",
      str(obj, "description"),
      str(obj, "id")
    ),
    priority: failed ? 4 : null,
    tags: tags("stripe", type.split(".")[0]),
  };
}

// ------------------------------------------------- Alertmanager / Grafana

function alertPriority(body: Body): number {
  if (str(body, "status") === "resolved") return 2;
  const severity = str(body, "commonLabels.severity").toLowerCase();
  if (severity === "critical") return 5;
  if (severity === "info") return 3;
  return 4;
}

function alertmanager(body: Body): AutoResult {
  const status = str(body, "status");
  const alerts = list(body, "alerts");
  const name = str(body, "commonLabels.alertname") || "Alert";
  const alertLines = alerts.slice(0, MAX_LIST_ITEMS).map((a) => {
    const summary = str(a, "annotations.summary") || str(a, "labels.alertname");
    const description = str(a, "annotations.description");
    return `- ${summary}${description ? `: ${description}` : ""}`;
  });
  return {
    title: `[${status.toUpperCase()}:${alerts.length}] ${name}`,
    message: lines(
      str(body, "commonAnnotations.summary"),
      ...alertLines,
      str(body, "externalURL")
    ),
    priority: alertPriority(body),
    tags: tags("alertmanager", status, str(body, "commonLabels.severity")),
  };
}

function grafana(body: Body): AutoResult {
  const base = alertmanager(body);
  return {
    ...base,
    // Grafana pre-renders title/message from its notification templates.
    title: str(body, "title") || base.title,
    message: str(body, "message") || base.message,
    tags: tags("grafana", str(body, "status"), str(body, "commonLabels.severity")),
  };
}

// ---------------------------------------------------------------- detect

/** `headers` keys must be lowercase (as produced by `Headers.forEach`). */
export function extractAuto(
  body: Body,
  headers: Record<string, string>
): AutoResult | null {
  const githubEvent = headers["x-github-event"];
  if (githubEvent) return github(githubEvent, body);

  const sentryResource = headers["sentry-hook-resource"];
  if (sentryResource) return sentry(sentryResource, body);

  if (headers["stripe-signature"] || (body.object === "event" && str(body, "type"))) {
    return stripe(body);
  }

  // Grafana unified alerting sends an Alertmanager-compatible payload plus
  // its own orgId/title/message fields.
  if (Array.isArray(body.alerts) && str(body, "groupKey")) {
    return "orgId" in body ? grafana(body) : alertmanager(body);
  }

  return null;
}
