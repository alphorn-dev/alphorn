import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { mapPriorityScale } from "@/lib/filter/schema";
import { truncate } from "./truncate";
import { meta } from "./pushover.meta";

const PUSHOVER_PRIORITY_SCALE = [-1, -1, 0, 1, 2] as const;

// Pushover limits: title 250 chars, message 1024 chars.
const PUSHOVER_TITLE_MAX = 250;
const PUSHOVER_MESSAGE_MAX = 1024;

const configSchema = z.object({
  apiToken: z.string().min(1, "API token is required"),
  userKey: z.string().min(1, "User key is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { apiToken, userKey } = config;
    const params = new URLSearchParams({
      token: apiToken,
      user: userKey,
      message: truncate(notification.message, PUSHOVER_MESSAGE_MAX),
    });
    if (notification.title) {
      params.set("title", truncate(notification.title, PUSHOVER_TITLE_MAX));
    }
    if (notification.priority != null) {
      const mapped = mapPriorityScale(notification.priority, PUSHOVER_PRIORITY_SCALE, 0);
      params.set("priority", String(mapped));
      if (mapped === 2) {
        params.set("retry", "60");
        params.set("expire", "3600");
      }
    }
    const res = await fetchWithTimeout("https://api.pushover.net/1/messages.json", {
      method: "POST",
      body: params,
    });
    await throwIfNotOk(res, "Pushover");
  },
});
