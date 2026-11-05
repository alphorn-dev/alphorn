// Vercel webhooks: https://vercel.com/docs/webhooks/webhooks-api
// Envelope: { id, type, createdAt, region, payload }. Signed with x-vercel-signature.

import {
  str,
  lines,
  tags,
  excerpt,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

const DEPLOYMENT_VERB: Record<string, string> = {
  "deployment.created": "started",
  "deployment.succeeded": "succeeded",
  "deployment.error": "failed",
  "deployment.canceled": "canceled",
};

function vercel(body: Body): AutoResult {
  const type = str(body, "type");
  const verb = lookup(DEPLOYMENT_VERB, type);
  // deployment.name is the project name used in the deployment URL.
  const project = str(body, "payload.deployment.name") || str(body, "payload.project.name");
  const dashboardUrl = str(body, "payload.links.deployment") || str(body, "payload.links.project");

  if (verb) {
    const target = str(body, "payload.target");
    // Git metadata is only present for Git-triggered deployments.
    const branch = str(body, "payload.deployment.meta.githubCommitRef");
    const commit = str(body, "payload.deployment.meta.githubCommitMessage").split("\n")[0];
    const author = str(body, "payload.deployment.meta.githubCommitAuthorName");
    return {
      title: `${project || "Vercel"} deployment ${verb}${target ? ` (${target})` : ""}`,
      message: lines(
        branch && `Branch: ${branch}`,
        commit && `Commit: ${excerpt(commit)}`,
        author && `Author: ${author}`,
        dashboardUrl
      ),
      // A later deployment.succeeded is not knowable from a failure, so only errors are flagged.
      priority: type === "deployment.error" ? 4 : null,
      tags: tags("vercel", type.toLowerCase(), target, project.toLowerCase(), branch),
    };
  }

  return {
    title: project ? `${project}: ${type || "event"}` : `Vercel: ${type || "event"}`,
    message: dashboardUrl,
    priority: null,
    tags: tags("vercel", type.toLowerCase(), project.toLowerCase()),
  };
}

export const vercelSource: AutoSource = {
  id: "vercel",
  detect: (_body, headers) => Boolean(headers["x-vercel-signature"]),
  extract: (body) => vercel(body),
};
