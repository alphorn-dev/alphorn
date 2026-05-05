import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { subjectFallback } from "./subject";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  region: z.enum(["us", "eu"]).default("us"),
  priority: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P3"),
});

registerChannel({
  type: "opsgenie",
  displayName: "Opsgenie",
  description: "Create alerts in Opsgenie",
  icon: "opsgenie",
  configSchema,
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      helpText:
        "From Settings > Integration List > API > Add. Use a 'Create and Close' API integration.",
    },
    {
      key: "region",
      label: "Region",
      type: "select",
      required: true,
      helpText: "Your Opsgenie instance region",
      options: [
        { label: "US (api.opsgenie.com)", value: "us" },
        { label: "EU (api.eu.opsgenie.com)", value: "eu" },
      ],
    },
    {
      key: "priority",
      label: "Default Priority",
      type: "select",
      required: true,
      helpText: "Default priority for created alerts",
      options: [
        { label: "P1 - Critical", value: "P1" },
        { label: "P2 - High", value: "P2" },
        { label: "P3 - Moderate", value: "P3" },
        { label: "P4 - Low", value: "P4" },
        { label: "P5 - Informational", value: "P5" },
      ],
    },
  ],
  async send(config, notification) {
    const { apiKey, region, priority } = configSchema.parse(config);
    const ogPriority =
      notification.priority != null
        ? notification.priority >= 5
          ? "P1"
          : notification.priority >= 4
            ? "P2"
            : notification.priority >= 3
              ? "P3"
              : notification.priority >= 2
                ? "P4"
                : "P5"
        : priority;

    const baseUrl =
      region === "eu"
        ? "https://api.eu.opsgenie.com"
        : "https://api.opsgenie.com";

    const res = await fetchWithTimeout(`${baseUrl}/v2/alerts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `GenieKey ${apiKey}`,
      },
      body: JSON.stringify({
        message: subjectFallback(notification.title, notification.message),
        description: notification.message,
        priority: ogPriority,
        source: "Alphorn",
      }),
    });
    await throwIfNotOk(res, "Opsgenie");
  },
  async test(config) {
    const { apiKey, region, priority } = configSchema.parse(config);
    const baseUrl =
      region === "eu"
        ? "https://api.eu.opsgenie.com"
        : "https://api.opsgenie.com";

    const res = await fetchWithTimeout(`${baseUrl}/v2/alerts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `GenieKey ${apiKey}`,
      },
      body: JSON.stringify({
        message: "Alphorn Test",
        description:
          "This is a test alert from Alphorn. If you see this, your Opsgenie channel is configured correctly. You can close this alert.",
        priority,
        source: "Alphorn",
      }),
    });
    await throwIfNotOk(res, "Opsgenie");
  },
});
