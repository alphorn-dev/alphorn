// Gitea, Forgejo and Gogs webhooks (Gitea payload format).
// Docs: https://docs.gitea.com/usage/webhooks and https://forgejo.org/docs/latest/user/webhooks/

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

// Gitea also sends X-GitHub-Event for compatibility. Detection stays on the
// native headers; the GitHub source is ordered first in ./index.ts.
const EVENT_HEADERS = ["x-gitea-event", "x-forgejo-event", "x-gogs-event"];

function eventOf(headers: Record<string, string>): string {
  for (const name of EVENT_HEADERS) {
    if (headers[name]) return headers[name];
  }
  return "";
}

// Gitea users have `login`; some payloads (Gogs) only carry `username`.
function login(obj: unknown, path: string): string {
  return str(obj, `${path}.login`) || str(obj, `${path}.username`);
}

function words(...parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

function labelOf(n: number | null): string {
  return n === null ? "" : ` #${n}`;
}

function titled(head: string, title: string): string {
  return title ? `${head}: ${title}` : head;
}

function gitea(event: string, body: Body): AutoResult {
  const repo = str(body, "repository.full_name");
  const prefix = repo ? `[${repo}] ` : "";
  const action = str(body, "action");
  const sender = login(body, "sender");
  const baseTags = tags("gitea", event, str(body, "repository.name"));
  const result = (title: string, message: string, priority: number | null = null): AutoResult => ({
    title: prefix + title,
    message,
    priority,
    tags: baseTags,
  });

  switch (event) {
    case "push": {
      const ref = str(body, "ref");
      const isTag = ref.startsWith("refs/tags/");
      const name = ref.replace(/^refs\/(heads|tags)\//, "");
      const pusher = login(body, "pusher") || sender;
      const commits = list(body, "commits");
      const total = num(body, "total_commits") ?? commits.length;
      const shown = commits.slice(0, MAX_LIST_ITEMS);
      const commitLines = shown.map((c) => {
        const sha = str(c, "id").slice(0, 7);
        const msg = str(c, "message").split("\n")[0];
        const author = str(c, "author.username") || str(c, "author.name");
        return `- ${sha} ${msg}${author ? ` (${author})` : ""}`;
      });
      if (total > shown.length) {
        commitLines.push(`… and ${total - shown.length} more`);
      }
      const what = isTag
        ? words("tag", name)
        : words(`${total} commit${total === 1 ? "" : "s"}`, name && `to ${name}`);
      return result(words(pusher, "pushed", what), lines(...commitLines, str(body, "compare_url")));
    }

    case "create":
    case "delete": {
      const verb = event === "create" ? "created" : "deleted";
      return result(words(sender, verb, str(body, "ref_type") || "ref", str(body, "ref")), "");
    }

    case "pull_request": {
      const pr = body.pull_request;
      const number = num(body, "number");
      const merged = action === "closed" && resolvePath(pr, "merged") === true;
      const verb = merged ? "merged" : action;
      const branches =
        str(pr, "head.ref") && str(pr, "base.ref")
          ? `${str(pr, "head.ref")} → ${str(pr, "base.ref")}`
          : "";
      return result(
        titled(words(`PR${labelOf(number)}`, verb), str(pr, "title")),
        lines(
          `${words(sender, verb, `pull request${labelOf(number)}`)}${branches ? ` (${branches})` : ""}`,
          action === "opened" ? excerpt(str(pr, "body")) : "",
          str(pr, "html_url")
        )
      );
    }

    case "issues": {
      const number = num(body, "number");
      return result(
        titled(words(`Issue${labelOf(number)}`, action), str(body, "issue.title")),
        lines(
          words(sender, action, `issue${labelOf(number)}`),
          action === "opened" ? excerpt(str(body, "issue.body")) : "",
          str(body, "issue.html_url")
        )
      );
    }

    case "issue_comment": {
      const kind = body.is_pull === true || body.pull_request ? "PR" : "issue";
      const ref = `${kind}${labelOf(num(body, "issue.number"))}`;
      return result(
        titled(words("Comment", action, "on", ref), str(body, "issue.title")),
        lines(
          words(sender, action, "a comment on", ref),
          action === "deleted" ? "" : excerpt(str(body, "comment.body")),
          str(body, "comment.html_url")
        )
      );
    }

    case "release": {
      const tag = str(body, "release.tag_name") || str(body, "release.name");
      return result(
        words("Release", tag, action),
        lines(action === "published" ? excerpt(str(body, "release.body")) : "", str(body, "release.html_url"))
      );
    }

    default:
      return result(
        words(event.replace(/_/g, " "), action) || "Gitea webhook",
        sender ? `by ${sender}` : ""
      );
  }
}

export const giteaSource: AutoSource = {
  id: "gitea",
  detect: (_body, headers) => Boolean(eventOf(headers)),
  extract: (body, headers) => gitea(eventOf(headers), body),
};
