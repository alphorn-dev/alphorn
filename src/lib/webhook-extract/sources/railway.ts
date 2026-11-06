// Railway webhooks: https://docs.railway.com/observability/webhooks
// Envelope: { type: "Deployment.failed", details, resource: { workspace, project,
// environment, service, deployment }, severity, timestamp }. Unsigned, no vendor
// header: detected by shape. Deployment types follow the deployment states
// (https://docs.railway.com/deployments/reference); volume and CPU/RAM monitor
// alerts use the same envelope with types the docs don't list, so anything
// else gets a generic title.

import { str, lines, tags, excerpt, lookup, type AutoSource, type Body, type AutoResult } from "./util";

// Deployment state (lowercased type suffix) -> verb and priority.
const DEPLOYMENT: Record<string, { verb: string; priority: number | null }> = {
  failed: { verb: "failed", priority: 4 },
  crashed: { verb: "crashed", priority: 4 },
  success: { verb: "succeeded", priority: null },
  succeeded: { verb: "succeeded", priority: null },
  deployed: { verb: "succeeded", priority: null },
  active: { verb: "is live", priority: null },
  completed: { verb: "completed", priority: null },
  initializing: { verb: "queued", priority: null },
  queued: { verb: "queued", priority: null },
  building: { verb: "building", priority: null },
  deploying: { verb: "deploying", priority: null },
  removed: { verb: "removed", priority: null },
};

const SEVERITY: Record<string, number> = { CRITICAL: 5, ERROR: 4, WARNING: 3 };

function railway(body: Body): AutoResult {
  const type = str(body, "type");
  const [kind, state = ""] = type.split(".");
  const project = str(body, "resource.project.name");
  const service = str(body, "resource.service.name");
  const environment = str(body, "resource.environment.name");
  const where = [project, service].filter(Boolean).join("/") || "Railway";
  const env = environment ? ` (${environment})` : "";

  const projectId = str(body, "resource.project.id");
  const serviceId = str(body, "resource.service.id");
  const environmentId = str(body, "resource.environment.id");
  const url = projectId
    ? `https://railway.com/project/${projectId}${serviceId ? `/service/${serviceId}` : ""}${
        environmentId ? `?environmentId=${environmentId}` : ""
      }`
    : "";

  const severity = lookup(SEVERITY, str(body, "severity").toUpperCase()) ?? null;
  const baseTags = [
    "railway",
    type.toLowerCase(),
    project.toLowerCase(),
    service.toLowerCase(),
    environment.toLowerCase(),
  ];

  const deployment = kind === "Deployment" ? lookup(DEPLOYMENT, state.toLowerCase()) : undefined;
  if (deployment) {
    const branch = str(body, "details.branch");
    const commit = str(body, "details.commitMessage").split("\n")[0];
    const author = str(body, "details.commitAuthor");
    const hash = str(body, "details.commitHash").slice(0, 7);
    return {
      title: `${where} deployment ${deployment.verb}${env}`,
      message: lines(
        branch && `Branch: ${branch}`,
        commit && `Commit: ${excerpt(commit)}${hash ? ` (${hash})` : ""}`,
        author && `Author: ${author}`,
        url,
      ),
      priority: deployment.priority,
      tags: tags(...baseTags, branch),
    };
  }

  // Volume / monitor alerts and future types: readable type plus Railway's severity.
  const readable = type.replace(/\./g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return {
    title: `${where}: ${readable || "event"}${env}`,
    message: url,
    priority: severity,
    tags: tags(...baseTags),
  };
}

export const railwaySource: AutoSource = {
  id: "railway",
  detect: (body) =>
    /^[A-Z][A-Za-z]*\.[A-Za-z_]+$/.test(str(body, "type")) &&
    typeof body.resource === "object" &&
    body.resource !== null &&
    Boolean(str(body, "resource.project.id")),
  extract: (body) => railway(body),
};
