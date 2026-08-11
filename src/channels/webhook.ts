import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk, PermanentChannelError } from "./errors";
import { SAME_HOST_ERROR, isSameHostAsApp, refineNotAppHost } from "./utils";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./webhook.meta";

const configSchema = z.object({
  url: refineNotAppHost(z.string().url("Must be a valid URL")),
  method: z.enum(["POST", "PUT"]).default("POST"),
  headers: z.record(z.string(), z.string()).default({}),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const { url, method, headers } = config;
    if (isSameHostAsApp(url)) {
      throw new PermanentChannelError(SAME_HOST_ERROR);
    }

    // Loop-tracking header is spread AFTER user headers so it cannot be
    // overridden by a malicious or misconfigured custom-headers entry.
    const outHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
      ...traceHeaders(context.trace),
    };

    const res = await fetchWithTimeout(url, {
      method,
      headers: outHeaders,
      body: JSON.stringify({
        ...(notification.title ? { title: notification.title } : {}),
        message: notification.message,
        ...(notification.priority != null ? { priority: notification.priority } : {}),
        ...(notification.tags?.length ? { tags: notification.tags } : {}),
        // Raw payload is nested (not merged top-level) so a raw key named
        // title/message/priority/tags can't clobber the normalized fields.
        ...(notification.payload ? { payload: notification.payload } : {}),
        timestamp: new Date().toISOString(),
      }),
    });
    await throwIfNotOk(res, "Webhook");
  },
  // Custom test: sends a distinct payload shape (title/body/_test flag) so
  // receivers can tell a test ping apart from a real notification.
  async test(config) {
    const { url, method, headers } = config;
    if (isSameHostAsApp(url)) {
      throw new PermanentChannelError(SAME_HOST_ERROR);
    }
    const res = await fetchWithTimeout(url, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Alphorn Test",
        body: "This is a test message from Alphorn. If you receive this, your webhook is configured correctly.",
        timestamp: new Date().toISOString(),
        _test: true,
      }),
    });
    await throwIfNotOk(res, "Webhook");
  },
});
