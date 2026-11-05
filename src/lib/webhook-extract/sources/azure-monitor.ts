// Azure Monitor alerts, common alert schema.
// https://learn.microsoft.com/azure/azure-monitor/alerts/alerts-common-schema
// Azure sends no identifying header, so detection uses the schemaId field.

import {
  resolvePath,
  str,
  list,
  lines,
  tags,
  excerpt,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

const SEVERITY_PRIORITY: Record<string, number> = {
  Sev0: 5,
  Sev1: 4,
  Sev2: 3,
};

function azureMonitor(body: Body): AutoResult {
  const essentials = "data.essentials";
  const condition = str(body, `${essentials}.monitorCondition`) || "Fired";
  const rule = str(body, `${essentials}.alertRule`) || "Azure Monitor alert";
  const severity = str(body, `${essentials}.severity`);
  const signalType = str(body, `${essentials}.signalType`);
  const service = str(body, `${essentials}.monitoringService`);
  const targetId = list(body, `${essentials}.alertTargetIDs`).find(
    (t): t is string => typeof t === "string"
  );
  const resource = (targetId ?? "").split("/").filter(Boolean).pop() ?? "";

  return {
    title: `[${condition}] ${rule}`,
    message: lines(
      excerpt(str(body, `${essentials}.description`)),
      resource ? `Resource: ${resource}` : "",
      service ? `Service: ${service}` : ""
    ),
    // Resolved is always priority 2 (recovered), regardless of severity.
    priority: condition === "Resolved" ? 2 : (lookup(SEVERITY_PRIORITY, severity) ?? null),
    tags: tags(
      "azure-monitor",
      condition.toLowerCase(),
      severity.toLowerCase(),
      signalType.toLowerCase()
    ),
  };
}

export const azureMonitorSource: AutoSource = {
  id: "azure-monitor",
  detect: (body) =>
    str(body, "schemaId") === "azureMonitorCommonAlertSchema" &&
    typeof resolvePath(body, "data.essentials") === "object",
  extract: (body) => azureMonitor(body),
};
