import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { mapPriorityScale } from "@/lib/filter/schema";
import { joinUrl, refineNotAppHost } from "./utils";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./ntfy.meta";

const NTFY_PRIORITY_SCALE = ["min", "low", "default", "high", "urgent"] as const;

// HTTP header values must not contain CR/LF, and undici throws on chars
// > 0xFF. ntfy's documented mechanism for non-ASCII header values is
// RFC 2047 base64 encoding.
function encodeHeaderValue(value: string): string {
  const clean = value.replace(/[\r\n]/g, "");
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

const configSchema = z.object({
  serverUrl: refineNotAppHost(z.string().url("Must be a valid URL")).default("https://ntfy.sh"),
  topic: z.string().min(1, "Topic is required"),
  accessToken: z.string().optional(),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const { serverUrl, topic, accessToken } = config;
    const headers: Record<string, string> = { ...traceHeaders(context.trace) };
    if (notification.title) {
      headers["X-Title"] = encodeHeaderValue(notification.title);
    }
    if (notification.priority != null) {
      headers["X-Priority"] = mapPriorityScale(notification.priority, NTFY_PRIORITY_SCALE, "default");
    }
    if (notification.tags?.length) {
      headers["X-Tags"] = encodeHeaderValue(notification.tags.join(","));
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
