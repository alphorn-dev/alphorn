// GitLab project and group webhooks, detected by the X-Gitlab-Event header.
// Docs: https://docs.gitlab.com/user/project/integrations/webhook_events/

import {
  str,
  num,
  list,
  excerpt,
  lines,
  tags,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

// GitLab action values (object_attributes.action, or top-level action for releases).
const VERBS: Record<string, string> = {
  open: "opened",
  close: "closed",
  reopen: "reopened",
  update: "updated",
  merge: "merged",
  approval: "approved",
  approved: "approved",
  unapproval: "unapproved",
  unapproved: "unapproved",
  create: "created",
  delete: "deleted",
};

const ZERO_SHA = /^0+$/;

function gitlab(kind: string, body: Body): AutoResult {
  const project = str(body, "project.path_with_namespace");
  const prefix = project ? `[${project}] ` : "";
  const actor = str(body, "user.username") || str(body, "user_username") || str(body, "user_name");
  const attrs = body.object_attributes;
  const action = str(attrs, "action") || str(body, "action");
  const verb = lookup(VERBS, action) ?? action;
  const result = (title: string, message: string, priority: number | null = null, state = "") => ({
    title: prefix + title,
    message,
    priority,
    tags: tags("gitlab", kind, str(body, "project.name").toLowerCase(), state),
  });

  switch (kind) {
    case "push":
    case "tag_push": {
      const isTag = kind === "tag_push";
      const name = str(body, "ref").replace(/^refs\/(heads|tags)\//, "");
      const target = isTag ? `tag ${name}` : `branch ${name}`;
      if (ZERO_SHA.test(str(body, "after"))) {
        return result(`${actor} deleted ${target}`, "");
      }
      const commits = list(body, "commits");
      const commitLines = commits.slice(0, MAX_LIST_ITEMS).map((c) => {
        const sha = str(c, "id").slice(0, 7);
        const title = str(c, "title") || str(c, "message").split("\n")[0];
        return `- ${sha} ${title}`;
      });
      if (commits.length > MAX_LIST_ITEMS) {
        commitLines.push(`… and ${commits.length - MAX_LIST_ITEMS} more`);
      }
      const count = num(body, "total_commits_count") ?? commits.length;
      const what = isTag ? `tag ${name}` : `${count} commit${count === 1 ? "" : "s"} to ${name}`;
      return result(`${actor} pushed ${what}`, lines(...commitLines, str(body, "project.web_url")));
    }

    case "merge_request": {
      const iid = num(attrs, "iid") ?? "?";
      const source = str(attrs, "source_branch");
      const target = str(attrs, "target_branch");
      const branches = source && target ? `${source} → ${target}` : "";
      return result(
        `MR !${iid} ${verb}: ${str(attrs, "title")}`,
        lines(
          `${actor} ${verb} merge request !${iid}${branches ? ` (${branches})` : ""}`,
          action === "open" ? excerpt(str(attrs, "description")) : "",
          str(attrs, "url")
        ),
        null,
        action
      );
    }

    case "issue":
      return result(
        `Issue #${num(attrs, "iid") ?? "?"} ${verb}: ${str(attrs, "title")}`,
        lines(
          `${actor} ${verb} issue #${num(attrs, "iid") ?? "?"}`,
          action === "open" ? excerpt(str(attrs, "description")) : "",
          str(attrs, "url")
        ),
        null,
        action
      );

    case "note": {
      const type = str(attrs, "noteable_type");
      const target =
        type === "Commit"
          ? `commit ${str(body, "commit.id").slice(0, 7)}`
          : type === "MergeRequest"
            ? `MR !${num(body, "merge_request.iid") ?? "?"}: ${str(body, "merge_request.title")}`
            : type === "Issue"
              ? `issue #${num(body, "issue.iid") ?? "?"}: ${str(body, "issue.title")}`
              : type.toLowerCase() || "item";
      return result(
        `Comment ${verb || "created"} on ${target}`,
        lines(`${actor}: ${excerpt(str(attrs, "note"))}`, str(attrs, "url"))
      );
    }

    case "pipeline": {
      const status = str(attrs, "status");
      const failedJobs = list(body, "builds").filter((b) => str(b, "status") === "failed");
      const jobLines = failedJobs.slice(0, MAX_LIST_ITEMS).map((b) => {
        const stage = str(b, "stage");
        return `- ${str(b, "name")}${stage ? ` (${stage})` : ""}`;
      });
      if (failedJobs.length > MAX_LIST_ITEMS) {
        jobLines.push(`… and ${failedJobs.length - MAX_LIST_ITEMS} more`);
      }
      return result(
        `Pipeline ${status || "updated"} on ${str(attrs, "ref")}`,
        lines(`${actor} ran pipeline`, ...jobLines, str(attrs, "url")),
        status === "failed" ? 4 : null,
        status
      );
    }

    case "release": {
      const tag = str(body, "tag");
      const name = str(body, "name");
      return result(
        `Release ${tag} ${verb}`,
        lines(name && name !== tag ? name : "", excerpt(str(body, "description")), str(body, "url")),
        null,
        action
      );
    }

    case "deployment": {
      const status = str(body, "status");
      const sha = str(body, "short_sha");
      const commitTitle = str(body, "commit_title");
      return result(
        `Deployment to ${str(body, "environment") || "unknown environment"} ${status || "updated"}`,
        lines(
          `${sha} ${commitTitle}`.trim(),
          str(body, "environment_external_url") || str(body, "commit_url")
        ),
        status === "failed" ? 4 : null,
        status
      );
    }

    default:
      return result(
        `${kind.replace(/_/g, " ") || "event"}${verb ? ` ${verb}` : ""}`,
        actor ? `by ${actor}` : ""
      );
  }
}

export const gitlabSource: AutoSource = {
  id: "gitlab",
  detect: (_body, headers) => Boolean(headers["x-gitlab-event"]),
  // "Merge Request Hook" -> "merge_request", "Push Hook" -> "push"
  extract: (body, headers) =>
    gitlab(
      headers["x-gitlab-event"].toLowerCase().replace(/ hook$/, "").replace(/ /g, "_"),
      body
    ),
};
