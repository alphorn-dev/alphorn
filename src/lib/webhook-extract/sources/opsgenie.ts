// Opsgenie outgoing Webhook integration payload.
// Docs: https://support.atlassian.com/opsgenie/docs/integrate-opsgenie-with-webhook/

import {
  str,
  list,
  lines,
  tags,
  excerpt,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

const PRIORITY_NOTIFICATION = new Map<string, number>([
  ["P1", 5],
  ["P2", 4],
  ["P3", 3],
  ["P4", 2],
  ["P5", 1],
]);

const ACTION_STATE = new Map<string, string>([
  ["Create", "created"],
  ["Acknowledge", "acknowledged"],
  ["Close", "closed"],
  ["AddNote", "note added"],
]);

function opsgenie(body: Body): AutoResult {
  const action = str(body, "action") || "unknown";
  const priority = str(body, "alert.priority");
  const message = str(body, "alert.message");
  const alertId = str(body, "alert.alertId");
  // Action names are CamelCase (e.g. "UpdatePriority"); fall back to spaced words.
  const state = ACTION_STATE.get(action) ?? action.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const alertTags = list(body, "alert.tags")
    .filter((t): t is string => typeof t === "string")
    .slice(0, MAX_LIST_ITEMS)
    .map((t) => t.toLowerCase());

  return {
    title: `${priority ? `[${priority}] ` : ""}Alert ${state}: ${message || alertId || "unknown alert"}`,
    message: lines(
      priority ? `Priority: ${priority}` : "",
      str(body, "alert.username") ? `By: ${str(body, "alert.username")}` : "",
      str(body, "alert.alias") ? `Alias: ${str(body, "alert.alias")}` : "",
      excerpt(str(body, "alert.description"))
    ),
    // Closing an alert is a recovery, so it wins over the alert's own priority.
    priority:
      action === "Close" ? 2 : (PRIORITY_NOTIFICATION.get(priority) ?? null),
    tags: tags("opsgenie", action.toLowerCase(), priority.toLowerCase(), ...alertTags),
  };
}

export const opsgenieSource: AutoSource = {
  id: "opsgenie",
  detect: (body) =>
    typeof body.action === "string" &&
    str(body, "alert.alertId") !== "" &&
    (typeof body.integrationName === "string" ||
      typeof body.integrationType === "string" ||
      str(body, "alert.integration.type") !== ""),
  extract: (body) => opsgenie(body),
};
