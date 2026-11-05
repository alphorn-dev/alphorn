import {
  str,
  list,
  lines,
  tags,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

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

// Grafana unified alerting sends an Alertmanager-compatible payload plus
// its own orgId/title/message fields.
function isAlertmanagerShape(body: Body): boolean {
  return Array.isArray(body.alerts) && str(body, "groupKey") !== "";
}

export const grafanaSource: AutoSource = {
  id: "grafana",
  detect: (body) => isAlertmanagerShape(body) && "orgId" in body,
  extract: (body) => grafana(body),
};

export const alertmanagerSource: AutoSource = {
  id: "alertmanager",
  detect: (body) => isAlertmanagerShape(body),
  extract: (body) => alertmanager(body),
};
