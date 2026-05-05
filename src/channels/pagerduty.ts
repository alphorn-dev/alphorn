import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  routingKey: z.string().min(1, "Routing key is required"),
  severity: z
    .enum(["critical", "error", "warning", "info"])
    .default("error"),
});

registerChannel({
  type: "pagerduty",
  displayName: "PagerDuty",
  description: "Create incidents in PagerDuty via Events API v2",
  icon: "pagerduty",
  configSchema,
  configFields: [
    {
      key: "routingKey",
      label: "Routing Key",
      type: "password",
      required: true,
      helpText:
        "Integration key from your PagerDuty service (Services > Service > Integrations > Events API v2)",
      placeholder: "e93facc04764012d7bfb002500d5d1a6",
    },
    {
      key: "severity",
      label: "Default Severity",
      type: "select",
      required: true,
      helpText: "Severity level for created incidents",
      options: [
        { label: "Critical", value: "critical" },
        { label: "Error", value: "error" },
        { label: "Warning", value: "warning" },
        { label: "Info", value: "info" },
      ],
    },
  ],
  async send(config, notification) {
    const { routingKey, severity } = configSchema.parse(config);
    const pdSeverity =
      notification.priority != null
        ? notification.priority >= 5
          ? "critical"
          : notification.priority >= 4
            ? "error"
            : notification.priority >= 3
              ? "warning"
              : "info"
        : severity;

    const res = await fetchWithTimeout("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: routingKey,
        event_action: "trigger",
        payload: {
          summary: notification.title
            ? `${notification.title}: ${notification.message}`
            : notification.message,
          severity: pdSeverity,
          source: "Alphorn",
        },
      }),
    });
    await throwIfNotOk(res, "PagerDuty");
  },
  async test(config) {
    const { routingKey, severity } = configSchema.parse(config);
    const res = await fetchWithTimeout("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: routingKey,
        event_action: "trigger",
        payload: {
          summary:
            "Alphorn Test: This is a test alert from Alphorn. You can resolve this incident.",
          severity,
          source: "Alphorn",
        },
      }),
    });
    await throwIfNotOk(res, "PagerDuty");
  },
});
