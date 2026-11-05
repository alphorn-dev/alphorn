// Bitbucket Cloud webhooks. Docs: https://support.atlassian.com/bitbucket-cloud/docs/event-payloads/
// The event key lives in the X-Event-Key header (not in the payload).

import {
  resolvePath,
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
} from "./util";

function bitbucket(eventKey: string, body: Body): AutoResult {
  const [resource = "", action = ""] = eventKey.split(":");
  const repo = str(body, "repository.full_name");
  const prefix = repo ? `[${repo}] ` : "";
  const actor = str(body, "actor.display_name") || str(body, "actor.nickname");
  const who = actor || "Someone";
  const baseTags = tags("bitbucket", resource, action, str(body, "repository.name"));
  const result = (
    title: string,
    message: string,
    priority: number | null = null,
    extraTags: string[] = []
  ): AutoResult => ({
    title: prefix + title,
    message,
    priority,
    tags: tags(...baseTags, ...extraTags),
  });

  if (eventKey === "repo:push") {
    const changes = list(body, "push.changes");
    const change = changes[0];
    const name = str(change, "new.name") || str(change, "old.name");
    const refType = str(change, "new.type") || str(change, "old.type") || "branch";
    if (!str(change, "new.name")) {
      return result(`${who} deleted ${refType} ${name}`, "");
    }
    if (resolvePath(change, "created") === true) {
      return result(`${who} created ${refType} ${name}`, str(change, "links.html.href"));
    }
    const commits = list(change, "commits");
    const count = `${commits.length}${resolvePath(change, "truncated") === true ? "+" : ""}`;
    const commitLines = commits.slice(0, MAX_LIST_ITEMS).map((c) => {
      const sha = str(c, "hash").slice(0, 7);
      const msg = str(c, "message").split("\n")[0].trim();
      const author = str(c, "author.user.display_name");
      return `- ${sha} ${msg}${author ? ` (${author})` : ""}`;
    });
    if (commits.length > MAX_LIST_ITEMS) {
      commitLines.push(`… and ${commits.length - MAX_LIST_ITEMS} more`);
    }
    if (changes.length > 1) {
      commitLines.push(`… and ${changes.length - 1} more ref changes`);
    }
    const what =
      refType === "tag" ? `tag ${name}` : `${count} commit${count === "1" ? "" : "s"} to ${name}`;
    return result(`${who} pushed ${what}`, lines(...commitLines, str(change, "links.html.href")));
  }

  if (resource === "pullrequest") {
    const number = num(body, "pullrequest.id") ?? "?";
    const ref = `PR #${number ?? "?"}`;
    const title = str(body, "pullrequest.title");
    const link = str(body, "pullrequest.links.html.href");
    const src = str(body, "pullrequest.source.branch.name");
    const dst = str(body, "pullrequest.destination.branch.name");
    const branches = src && dst ? ` (${src} → ${dst})` : "";
    switch (action) {
      case "created":
        return result(
          `${ref} opened: ${title}`,
          lines(
            `${who} opened pull request #${number ?? "?"}${branches}`,
            excerpt(str(body, "pullrequest.description")),
            link
          )
        );
      case "updated":
        return result(`${ref} updated: ${title}`, lines(`${who} updated pull request #${number ?? "?"}`, link));
      case "approved":
        return result(`${ref} approved: ${title}`, lines(`${who} approved pull request #${number ?? "?"}`, link));
      case "unapproved":
        return result(`${ref} approval removed: ${title}`, lines(`${who} removed approval`, link));
      case "fulfilled":
        return result(
          `${ref} merged: ${title}`,
          lines(`${who} merged pull request #${number ?? "?"}${branches}`, link)
        );
      case "rejected":
        return result(`${ref} declined: ${title}`, lines(`${who} declined pull request #${number ?? "?"}`, link));
      case "comment_created":
        return result(
          `Comment on ${ref}: ${title}`,
          lines(`${who}: ${excerpt(str(body, "comment.content.raw"))}`, str(body, "comment.links.html.href"))
        );
    }
  }

  if (resource === "issue") {
    const number = num(body, "issue.id") ?? "?";
    const title = str(body, "issue.title");
    const link = str(body, "issue.links.html.href");
    if (action === "comment_created") {
      return result(
        `Comment on issue #${number ?? "?"}: ${title}`,
        lines(`${who}: ${excerpt(str(body, "comment.content.raw"))}`, str(body, "comment.links.html.href"))
      );
    }
    if (action === "created" || action === "updated") {
      // Bitbucket marks a resolved issue with state "resolved" (recovery, priority 2).
      const resolved = str(body, "issue.state") === "resolved";
      const verb = action === "created" ? "opened" : resolved ? "resolved" : "updated";
      return result(
        `Issue #${number ?? "?"} ${verb}: ${title}`,
        lines(
          `${who} ${verb} issue #${number ?? "?"}`,
          action === "created" ? excerpt(str(body, "issue.content.raw")) : "",
          link
        ),
        resolved ? 2 : null
      );
    }
  }

  if (eventKey === "repo:commit_status_created" || eventKey === "repo:commit_status_updated") {
    const state = str(body, "commit_status.state").toLowerCase();
    const name = str(body, "commit_status.name") || str(body, "commit_status.key") || "build";
    return result(
      `Build ${name}: ${state || "updated"}`,
      lines(str(body, "commit_status.description"), str(body, "commit_status.url")),
      state === "failed" ? 4 : null,
      [state]
    );
  }

  return result(eventKey.replace(":", " "), actor ? `by ${actor}` : "");
}

export const bitbucketSource: AutoSource = {
  id: "bitbucket",
  detect: (_body, headers) =>
    Boolean(headers["x-event-key"]?.includes(":")) &&
    Boolean(headers["x-hook-uuid"] || headers["x-request-uuid"]),
  extract: (body, headers) => bitbucket(headers["x-event-key"], body),
};
