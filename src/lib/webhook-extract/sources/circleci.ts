// CircleCI outbound webhooks. Docs: https://circleci.com/docs/guides/integration/outbound-webhooks/
import { str, num, lines, tags, type AutoSource, type Body, type AutoResult, lookup } from "./util";

const FAILED = new Set(["failed", "error", "failing"]);
const PAST_TENSE: Record<string, string> = { success: "succeeded" };

function circleci(type: string, body: Body): AutoResult {
  if (type !== "workflow-completed" && type !== "job-completed") {
    return {
      title: `CircleCI: ${type.replace(/-/g, " ")}`,
      message: "",
      priority: null,
      tags: tags("circleci", type),
    };
  }

  const isJob = type === "job-completed";
  const scope = isJob ? "job" : "workflow";
  const name = str(body, `${scope}.name`);
  const status = str(body, `${scope}.status`).toLowerCase();
  const workflowName = str(body, "workflow.name");
  const project = str(body, "project.name") || str(body, "project.slug").split("/").pop() || "";
  const branch =
    str(body, "pipeline.vcs.branch") || str(body, "pipeline.trigger_parameters.git.branch");
  const pipelineNumber = num(body, "pipeline.number");
  const outcome = lookup(PAST_TENSE, status) ?? (status || "completed");
  const label = isJob && name ? `Job ${name}` : isJob ? "Job" : "Workflow";

  return {
    title: `[${project || "CircleCI"}] ${label} build ${outcome}${branch ? ` on ${branch}` : ""}`,
    message: lines(
      str(body, "pipeline.vcs.commit.subject") ||
        str(body, "pipeline.trigger_parameters.gitlab.commit_title"),
      isJob && name ? `Job: ${name}` : "",
      workflowName ? `Workflow: ${workflowName}` : "",
      pipelineNumber !== null ? `Pipeline #${pipelineNumber}` : "",
      str(body, `${scope}.url`) || str(body, "workflow.url")
    ),
    priority: FAILED.has(status) ? 4 : null,
    tags: tags("circleci", type, status, project.toLowerCase()),
  };
}

export const circleciSource: AutoSource = {
  id: "circleci",
  detect: (_body, headers) => Boolean(headers["circleci-event-type"]),
  extract: (body, headers) => circleci(headers["circleci-event-type"], body),
};
