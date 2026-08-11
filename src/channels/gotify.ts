import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { mapPriorityScale } from "@/lib/filter/schema";
import { joinUrl, refineNotAppHost } from "./utils";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./gotify.meta";

// Gotify uses a 0-10 scale; Android treats >= 8 as high priority, so our
// critical (5) must land at 10, not 5.
const GOTIFY_PRIORITY_SCALE = [1, 3, 5, 8, 10] as const;

const configSchema = z.object({
  serverUrl: refineNotAppHost(z.string().url("Must be a valid URL")),
  appToken: z.string().min(1, "App token is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const { serverUrl, appToken } = config;
    const res = await fetchWithTimeout(joinUrl(serverUrl, "message"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gotify-Key": appToken,
        ...traceHeaders(context.trace),
      },
      body: JSON.stringify({
        ...(notification.title ? { title: notification.title } : {}),
        message: notification.message,
        priority: mapPriorityScale(notification.priority, GOTIFY_PRIORITY_SCALE, 5),
      }),
    });
    await throwIfNotOk(res, "Gotify");
  },
});
