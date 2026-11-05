// Atlassian Statuspage subscriber webhooks (status pages of vendors).
// Docs: https://support.atlassian.com/statuspage/docs/enable-webhook-notifications/
// No vendor header is documented, so detection uses the payload shape.

import {
  resolvePath,
  str,
  list,
  lines,
  excerpt,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

const INCIDENT_IMPACT_PRIORITY: Record<string, number> = {
  critical: 5,
  major: 4,
  minor: 3,
};

const COMPONENT_STATUS_PRIORITY: Record<string, number> = {
  major_outage: 5,
  partial_outage: 4,
  degraded_performance: 3,
  operational: 2,
};

function incident(body: Body): AutoResult {
  const name = str(body, "incident.name") || "Incident";
  const status = str(body, "incident.status");
  const impact = str(body, "incident.impact");
  // Latest update first, as sent by Statuspage.
  const latest = list(body, "incident.incident_updates")[0];
  return {
    title: `${name}: ${status || "updated"}`,
    message: lines(excerpt(str(latest, "body")), str(body, "incident.shortlink")),
    priority: status === "resolved" ? 2 : (lookup(INCIDENT_IMPACT_PRIORITY, impact) ?? null),
    tags: tags("statuspage", "incident", status, impact),
  };
}

function componentUpdate(body: Body): AutoResult {
  const name = str(body, "component.name") || "Component";
  const oldStatus = str(body, "component_update.old_status") || "unknown";
  const newStatus = str(body, "component_update.new_status") || "unknown";
  return {
    title: `${name}: ${oldStatus} -> ${newStatus}`,
    message: str(body, "page.status_description"),
    priority: lookup(COMPONENT_STATUS_PRIORITY, newStatus) ?? null,
    tags: tags("statuspage", "component_update", newStatus),
  };
}

export const statuspageSource: AutoSource = {
  id: "statuspage",
  detect: (body) =>
    Boolean(str(body, "meta.unsubscribe")) &&
    Boolean(str(body, "page.id")) &&
    Boolean(resolvePath(body, "incident") || resolvePath(body, "component_update")),
  extract: (body) =>
    resolvePath(body, "incident") ? incident(body) : componentUpdate(body),
};
