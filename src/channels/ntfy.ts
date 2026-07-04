import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { mapPriorityScale } from "@/lib/filter/schema";
import { joinUrl } from "./utils";
import { meta } from "./ntfy.meta";

const NTFY_PRIORITY_SCALE = ["min", "low", "default", "high", "urgent"] as const;

const configSchema = z.object({
  serverUrl: z
    .string()
    .url("Must be a valid URL")
    .default("https://ntfy.sh"),
  topic: z.string().min(1, "Topic is required"),
  accessToken: z.string().optional(),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { serverUrl, topic, accessToken } = config;
    const headers: Record<string, string> = {};
    if (notification.title) {
      headers["X-Title"] = notification.title;
    }
    if (notification.priority != null) {
      headers["X-Priority"] = mapPriorityScale(notification.priority, NTFY_PRIORITY_SCALE, "default");
    }
    if (notification.tags?.length) {
      headers["X-Tags"] = notification.tags.join(",");
    }
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const res = await fetchWithTimeout(
      joinUrl(serverUrl, topic),
      {
        method: "POST",
        headers,
        body: notification.message,
      }
    );
    await throwIfNotOk(res, "Ntfy");
  },
});
