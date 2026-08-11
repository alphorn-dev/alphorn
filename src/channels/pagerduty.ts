import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { mapPriorityScale } from "@/lib/filter/schema";
import { truncate } from "./truncate";
import { meta } from "./pagerduty.meta";

const PAGERDUTY_PRIORITY_SCALE = ["info", "info", "warning", "error", "critical"] as const;

// PagerDuty Events API v2 rejects summaries over 1024 chars.
const PAGERDUTY_SUMMARY_MAX = 1024;

const configSchema = z.object({
  routingKey: z.string().min(1, "Routing key is required"),
  severity: z
    .enum(["critical", "error", "warning", "info"])
    .default("error"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { routingKey, severity } = config;
    const pdSeverity = mapPriorityScale(notification.priority, PAGERDUTY_PRIORITY_SCALE, severity);

    const res = await fetchWithTimeout("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: routingKey,
        event_action: "trigger",
        payload: {
          summary: truncate(
            notification.title
              ? `${notification.title}: ${notification.message}`
              : notification.message,
            PAGERDUTY_SUMMARY_MAX
          ),
          severity: pdSeverity,
          source: "Alphorn",
        },
      }),
    });
    await throwIfNotOk(res, "PagerDuty");
  },
  // Custom test: real PagerDuty incidents need to be resolved, so the test
  // message tells the user they can safely resolve it.
  async test(config) {
    const { routingKey, severity } = config;
    const res = await fetchWithTimeout("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: routingKey,
        event_action: "trigger",
        payload: {
          summary: "Alphorn Test: This is a test alert from Alphorn. You can resolve this incident.",
          severity,
          source: "Alphorn",
        },
      }),
    });
    await throwIfNotOk(res, "PagerDuty");
  },
});
