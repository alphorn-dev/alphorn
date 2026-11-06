import {
  resolvePath,
  str,
  num,
  list,
  excerpt,
  lines,
  tags,
  lookup,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// Alert actions that open (or re-open) a finding and deserve a priority; resolving ones don't.
const OPENING_ALERT = new Set(["created", "reopened", "reopened_by_user", "auto_reopened", "reintroduced", "appeared_in_branch"]);

// GitHub advisory / CodeQL severities to Alphorn priority. CodeQL rules without a
// security severity use error / warning / note.
const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 5, high: 4, error: 4, medium: 3, moderate: 3, warning: 3, low: 2, note: 2,
};
const severityPriority = (severity: string) => lookup(SEVERITY_PRIORITY, severity.toLowerCase()) ?? null;

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
        `PR #${number ?? "?"} ${verb}: ${str(pr, "title")}`,
        lines(
          `${sender} ${verb} pull request #${number ?? "?"}${branches ? ` (${branches})` : ""}`,
          action === "opened" ? excerpt(str(pr, "body")) : "",
          str(pr, "html_url")
        )
      );
    }

    case "pull_request_review": {
      const state = str(body, "review.state").replace(/_/g, " ").toLowerCase();
      return result(
        `PR #${num(body, "pull_request.number") ?? "?"} review ${state}: ${str(body, "pull_request.title")}`,
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
            ? `PR #${num(body, "pull_request.number") ?? "?"}: ${str(body, "pull_request.title")}`
            : `${resolvePath(body, "issue.pull_request") ? "PR" : "issue"} #${num(body, "issue.number") ?? "?"}: ${str(body, "issue.title")}`;
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
        `Issue #${num(body, "issue.number") ?? "?"} ${action}: ${str(body, "issue.title")}`,
        lines(
          `${sender} ${action} issue #${num(body, "issue.number") ?? "?"}`,
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

    case "secret_scanning_alert": {
      const type = str(body, "alert.secret_type_display_name") || str(body, "alert.secret_type");
      const what =
        action === "publicly_leaked" ? "leaked publicly" : action === "created" ? "detected" : action.replace(/_/g, " ");
      return result(
        `Secret ${what}: ${type || "unknown type"}`,
        // Never the secret itself: only its type and the alert link.
        lines(`Secret scanning alert #${num(body, "alert.number") ?? "?"}`, str(body, "alert.html_url")),
        OPENING_ALERT.has(action) || action === "publicly_leaked" ? 5 : null
      );
    }

    case "dependabot_alert": {
      const severity = str(body, "alert.security_advisory.severity") || str(body, "alert.security_vulnerability.severity");
      const pkg = str(body, "alert.dependency.package.name");
      const fixedIn = str(body, "alert.security_vulnerability.first_patched_version.identifier");
      return result(
        `Dependabot: ${severity || "vulnerable"} ${pkg || "dependency"} ${action.replace(/_/g, " ")}`,
        lines(
          str(body, "alert.security_advisory.summary"),
          [str(body, "alert.security_advisory.ghsa_id"), str(body, "alert.dependency.manifest_path")]
            .filter(Boolean)
            .join(" · "),
          fixedIn && `Fixed in ${fixedIn}`,
          str(body, "alert.html_url")
        ),
        OPENING_ALERT.has(action) ? severityPriority(severity) : null
      );
    }

    case "code_scanning_alert": {
      const severity = str(body, "alert.rule.security_severity_level") || str(body, "alert.rule.severity");
      const path = str(body, "alert.most_recent_instance.location.path");
      const line = num(body, "alert.most_recent_instance.location.start_line");
      return result(
        `Code scanning: ${str(body, "alert.rule.description") || "alert"} ${action.replace(/_/g, " ")}`,
        lines(
          [str(body, "alert.tool.name"), severity].filter(Boolean).join(" · "),
          path && `${path}${line ? `:${line}` : ""}`,
          str(body, "alert.html_url")
        ),
        OPENING_ALERT.has(action) ? severityPriority(severity) : null
      );
    }

    case "repository_advisory":
      return result(
        `Security advisory ${action}: ${str(body, "repository_advisory.summary")}`,
        lines(
          [str(body, "repository_advisory.ghsa_id"), str(body, "repository_advisory.severity")].filter(Boolean).join(" · "),
          str(body, "repository_advisory.html_url")
        ),
        action === "reported" ? 4 : action === "published" ? 3 : null
      );

    case "deployment_status": {
      const state = str(body, "deployment_status.state");
      const env = str(body, "deployment_status.environment") || str(body, "deployment.environment");
      return result(
        `Deployment to ${env || "environment"} ${state.replace(/_/g, " ") || action}`,
        lines(
          [str(body, "deployment.ref"), str(body, "deployment_status.description")].filter(Boolean).join(" · "),
          str(body, "deployment_status.environment_url") ||
            str(body, "deployment_status.log_url") ||
            str(body, "deployment_status.target_url")
        ),
        state === "failure" || state === "error" ? 4 : null
      );
    }

    case "deployment_review": {
      const env =
        str(body, "environment") || str(list(body, "workflow_job_runs")[0], "environment");
      const who = str(body, "approver.login") || str(body, "requestor.login") || sender;
      return result(
        action === "requested"
          ? `Deployment approval requested for ${env || "an environment"}`
          : `Deployment to ${env || "environment"} ${action} by ${who}`,
        lines(str(body, "workflow_run.display_title"), str(body, "workflow_run.html_url")),
        action === "requested" ? 3 : null
      );
    }

    case "discussion":
      return result(
        `Discussion #${num(body, "discussion.number") ?? "?"} ${action}: ${str(body, "discussion.title")}`,
        lines(
          `${sender} ${action} the discussion`,
          action === "created" ? excerpt(str(body, "discussion.body")) : "",
          str(body, "discussion.html_url")
        )
      );

    case "discussion_comment":
      return result(
        `Comment ${action} on discussion #${num(body, "discussion.number") ?? "?"}: ${str(body, "discussion.title")}`,
        lines(
          `${str(body, "comment.user.login") || sender}: ${excerpt(str(body, "comment.body"))}`,
          str(body, "comment.html_url")
        )
      );

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

export const githubSource: AutoSource = {
  id: "github",
  detect: (_body, headers) => Boolean(headers["x-github-event"]),
  extract: (body, headers) => github(headers["x-github-event"], body),
};
