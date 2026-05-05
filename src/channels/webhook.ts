import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk, PermanentChannelError } from "./errors";
import { compareHosts } from "@/lib/webhook-loop/same-host";
import { TRACE_HEADER, signTrace } from "@/lib/webhook-loop/hops";

const SAME_HOST_ERROR =
  "Webhook channels can't point at this Alphorn instance. Use a channel directly on your webhook instead.";

function getAppUrl(): string {
  const u = process.env.BETTER_AUTH_URL;
  if (!u) throw new Error("BETTER_AUTH_URL is required");
  return u;
}

const configSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine((url) => !compareHosts(url, getAppUrl()), {
      message: SAME_HOST_ERROR,
    }),
  method: z.enum(["POST", "PUT"]).default("POST"),
  headers: z.record(z.string(), z.string()).default({}),
});

registerChannel({
  type: "webhook",
  displayName: "Webhook",
  description: "Send notifications to any HTTP endpoint",
  icon: "webhook",
  configSchema,
  configFields: [
    {
      key: "url",
      label: "Endpoint URL",
      type: "text",
      required: true,
      helpText:
        "The URL that will receive POST/PUT requests. It cannot point at this Alphorn instance — to deliver to a webhook here, attach channels directly to that webhook.",
      placeholder: "https://api.example.com/notifications",
    },
    {
      key: "method",
      label: "HTTP Method",
      type: "select",
      required: true,
      options: [
        { label: "POST", value: "POST" },
        { label: "PUT", value: "PUT" },
      ],
    },
    {
      key: "headers",
      label: "Custom Headers",
      type: "keyvalue",
      helpText: "Additional HTTP headers to send with the request (e.g. Authorization)",
    },
  ],
  async send(config, notification, context) {
    const { url, method, headers } = configSchema.parse(config);
    if (compareHosts(url, getAppUrl())) {
      throw new PermanentChannelError(SAME_HOST_ERROR);
    }

    // Loop-tracking header is spread AFTER user headers so it cannot be
    // overridden by a malicious or misconfigured custom-headers entry.
    const outHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
      [TRACE_HEADER]: signTrace(context.trace ?? []),
    };

    const res = await fetchWithTimeout(url, {
      method,
      headers: outHeaders,
      body: JSON.stringify({
        ...(notification.title ? { title: notification.title } : {}),
        message: notification.message,
        ...(notification.priority != null ? { priority: notification.priority } : {}),
        ...(notification.tags?.length ? { tags: notification.tags } : {}),
        ...(notification.payload || {}),
        timestamp: new Date().toISOString(),
      }),
    });
    await throwIfNotOk(res, "Webhook");
  },
  async test(config) {
    const { url, method, headers } = configSchema.parse(config);
    if (compareHosts(url, getAppUrl())) {
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
