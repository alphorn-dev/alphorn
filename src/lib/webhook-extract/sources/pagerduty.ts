// PagerDuty V3 webhooks: https://docs.pagerduty.com/developer/webhooks-overview
import {
  str,
  num,
  list,
  lines,
  tags,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

function field(label: string, value: string): string {
  return value ? `${label}: ${value}` : "";
}

function incidentPriority(eventType: string, urgency: string, priority: string): number | null {
  if (eventType === "incident.triggered") {
    return urgency === "high" || priority.toUpperCase() === "P1" ? 5 : 4;
  }
  if (eventType === "incident.reopened") return 4;
  if (eventType === "incident.resolved") return 2;
  return null;
}

function pagerduty(body: Body): AutoResult {
  const eventType = str(body, "event.event_type");
  const parts = eventType.split(".");
  const action = parts.slice(1).join(" ").replace(/_/g, " ");
  const title = str(body, "event.data.title") || str(body, "event.data.name");
  const service = str(body, "event.data.service.summary");
  const status = str(body, "event.data.status");
  const urgency = str(body, "event.data.urgency");
  const priority = str(body, "event.data.priority.summary");
  const actor = str(body, "event.agent.summary");
  const assignees = list(body, "event.data.assignees")
    .slice(0, MAX_LIST_ITEMS)
    .map((a) => str(a, "summary"))
    .filter(Boolean);

  const message = lines(
    field("Service", service),
    field("Priority", priority),
    field("Urgency", urgency),
    field("Assignees", assignees.join(", ")),
    field("By", actor),
    str(body, "event.data.html_url")
  );
  const tagList = tags("pagerduty", eventType, status, service.toLowerCase());

  if (parts[0] === "incident") {
    const number = num(body, "event.data.number");
    const ref = number === null ? "Incident" : `Incident #${number}`;
    return {
      title: `${service ? `[${service}] ` : ""}${ref} ${action}${title ? `: ${title}` : ""}`,
      message,
      priority: incidentPriority(eventType, urgency, priority),
      tags: tagList,
    };
  }

  const label = [parts[0], action].filter(Boolean).join(" ") || "event";
  return {
    title: `PagerDuty: ${label}${title ? `: ${title}` : ""}`,
    message,
    priority: null,
    tags: tagList,
  };
}

export const pagerdutySource: AutoSource = {
  id: "pagerduty",
  detect: (body, headers) =>
    Boolean(headers["x-pagerduty-signature"]) ||
    (/^(incident|service)\./.test(str(body, "event.event_type")) &&
      str(body, "event.resource_type") !== ""),
  extract: (body) => pagerduty(body),
};
