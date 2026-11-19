// Cloudflare Notifications, generic webhook destination:
// { name, text, data, ts, policy_name, alert_correlation_id, alert_event,
//   account_id?, policy_id?, alert_type? }. `name` is the notification policy
// name, `text` the description with values filled in, `data` varies per alert type.
// Docs: https://developers.cloudflare.com/notifications/reference/webhook-payload-schema/

import {
  str,
  num,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

function cloudflare(body: Body): AutoResult {
  const name =
    str(body, "name") || str(body, "policy_name") || "Cloudflare notification";
  const event = str(body, "alert_event");
  const status =
    event === "ALERT_STATE_EVENT_START"
      ? "started"
      : event === "ALERT_STATE_EVENT_END"
        ? "resolved"
        : "";

  return {
    title: status === "resolved" ? `Resolved: ${name}` : name,
    message: str(body, "text"),
    priority: status === "started" ? 4 : status === "resolved" ? 2 : null,
    tags: tags("cloudflare", str(body, "alert_type"), status),
  };
}

export const cloudflareSource: AutoSource = {
  id: "cloudflare",
  // Payload shape only: the cf-webhook-auth header is sent only when a secret is set.
  detect: (body) =>
    str(body, "text") !== "" &&
    num(body, "ts") !== null &&
    ("policy_name" in body || "policy_id" in body || "alert_type" in body),
  extract: (body) => cloudflare(body),
};
