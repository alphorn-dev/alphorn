import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { subjectFallback } from "./subject";
import { throwIfNotOk } from "./errors";
import { truncate } from "./truncate";
import { mapPriorityScale } from "@/lib/filter/schema";
import { meta } from "./opsgenie.meta";

const OPSGENIE_PRIORITY_SCALE = ["P5", "P4", "P3", "P2", "P1"] as const;

// Opsgenie hard limits: alert message 130 chars, description 15000 chars.
const OPSGENIE_MESSAGE_MAX = 130;
const OPSGENIE_DESCRIPTION_MAX = 15000;

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  region: z.enum(["us", "eu"]).default("us"),
  priority: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P3"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { apiKey, region, priority } = config;
    const ogPriority = mapPriorityScale(notification.priority, OPSGENIE_PRIORITY_SCALE, priority);

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
        message: truncate(subjectFallback(notification.title, notification.message), OPSGENIE_MESSAGE_MAX),
        description: truncate(notification.message, OPSGENIE_DESCRIPTION_MAX),
        priority: ogPriority,
        source: "Alphorn",
      }),
    });
    await throwIfNotOk(res, "Opsgenie");
  },
  // Custom test: real Opsgenie alerts need to be closed, so the test
  // message tells the user they can safely close it.
  async test(config) {
    const { apiKey, region, priority } = config;
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
