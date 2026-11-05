// Linear webhooks (Issue, Comment, Project, ...). Docs: https://linear.app/developers/webhooks
import {
  resolvePath,
  str,
  num,
  excerpt,
  lines,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// Linear issue priority: 0 none, 1 urgent, 2 high, 3 medium, 4 low.
function linearPriority(value: number | null): number | null {
  return value === 1 ? 5 : value === 2 ? 4 : null;
}

function linear(body: Body): AutoResult {
  const type = str(body, "type");
  const action = str(body, "action");
  const url = str(body, "url");
  const actor = str(body, "actor.name");
  // Comments carry only issueId, so the identifier is read from the URL path
  // (https://linear.app/<team>/issue/ENG-123/<slug>#comment-...).
  const identifier = str(body, "data.identifier") || url.match(/\/issue\/([A-Z0-9]+-\d+)/)?.[1] || "";
  const changed = resolvePath(body, "updatedFrom");
  const changedLine =
    typeof changed === "object" && changed !== null && !Array.isArray(changed)
      ? `Changed: ${Object.keys(changed).join(", ")}`
      : "";
  const footer = [actor ? `By ${actor}` : "", changedLine, url];
  const baseTags = tags("linear", type.toLowerCase(), action, str(body, "data.team.key").toLowerCase());

  if (type === "Issue") {
    const title = str(body, "data.title");
    const state = str(body, "data.state.name");
    const priorityLabel = str(body, "data.priorityLabel");
    const subject = [identifier || "Issue", action].filter(Boolean).join(" ");
    return {
      title: title ? `${subject}: ${title}` : subject,
      message: lines(
        state ? `State: ${state}` : "",
        priorityLabel ? `Priority: ${priorityLabel}` : "",
        ...footer
      ),
      priority: linearPriority(num(body, "data.priority")),
      tags: baseTags,
    };
  }

  if (type === "Comment") {
    const subject = [identifier, "comment", action].filter(Boolean).join(" ");
    return {
      title: subject,
      message: lines(excerpt(str(body, "data.body")), ...footer),
      priority: null,
      tags: baseTags,
    };
  }

  if (type === "Project") {
    const name = str(body, "data.name");
    // Per the SDK, projects carry a `status` object; `state` is a fallback for older payloads.
    const state = str(body, "data.status.name") || str(body, "data.state");
    return {
      title: name ? `Project ${action}: ${name}` : `Project ${action}`,
      message: lines(state ? `State: ${state}` : "", ...footer),
      priority: null,
      tags: baseTags,
    };
  }

  return {
    title: `Linear ${type ? type.toLowerCase() : "event"} ${action}`.trim(),
    message: lines(...footer),
    priority: null,
    tags: baseTags,
  };
}

export const linearSource: AutoSource = {
  id: "linear",
  detect: (_body, headers) => Boolean(headers["linear-event"]),
  extract: (body) => linear(body),
};
