// Google Cloud Monitoring webhook notification channel, payload schema 1.2.
// https://docs.cloud.google.com/monitoring/support/notification-options
// Google sends no identifying headers, so detection is by payload shape.

import { str, lines, tags, type AutoSource, type Body, type AutoResult, lookup } from "./util";

const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 5,
  ERROR: 4,
  WARNING: 3,
};

function gcpMonitoring(body: Body): AutoResult {
  const state = str(body, "incident.state");
  const policy = str(body, "incident.policy_name");
  const summary = str(body, "incident.summary");
  const severity = str(body, "incident.severity");
  const resource = str(body, "incident.resource_display_name") || str(body, "incident.resource_name");
  const condition = str(body, "incident.condition_name");
  const observed = str(body, "incident.observed_value");
  const threshold = str(body, "incident.threshold_value");
  const what = summary || condition || "incident";
  const prefix = policy ? `[${policy}] ` : "";

  return {
    title: state === "closed" ? `${prefix}resolved: ${what}` : `${prefix}${what}`,
    message: lines(
      resource ? `Resource: ${resource}` : "",
      condition ? `Condition: ${condition}` : "",
      observed ? `Observed: ${observed}${threshold ? ` (threshold ${threshold})` : ""}` : "",
      str(body, "incident.url")
    ),
    // Open incidents follow the policy severity; closed ones are recoveries.
    priority:
      state === "open" ? (lookup(SEVERITY_PRIORITY, severity) ?? 4) : state === "closed" ? 2 : null,
    tags: tags(
      "gcp-monitoring",
      state.toLowerCase(),
      severity.toLowerCase(),
      str(body, "incident.scoping_project_id")
    ),
  };
}

export const gcpMonitoringSource: AutoSource = {
  id: "gcp-monitoring",
  detect: (body) =>
    str(body, "version") === "1.2" &&
    str(body, "incident.incident_id") !== "" &&
    str(body, "incident.policy_name") !== "",
  extract: (body) => gcpMonitoring(body),
};
