import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk, PermanentChannelError } from "./errors";
import { SAME_HOST_ERROR, isSameHostAsApp, refineNotAppHost } from "./utils";
import { TRACE_HEADER, traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./forward.meta";

// Same validation as the Webhook channel: undici rejects invalid header names
// and values with CR/LF, so fail at save time instead of retrying.
const configSchema = z.object({
  url: refineNotAppHost(z.string().url("Must be a valid URL")),
  method: z.enum(["POST", "PUT"]).default("POST"),
  headers: z
    .record(
      z
        .string()
        .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, "Invalid header name")
        // Header names are case-insensitive: "X-Alphorn-Trace" would be sent
        // next to the real trace header and break loop detection.
        .refine((name) => name.toLowerCase() !== TRACE_HEADER, "This header is set by Alphorn"),
      z.string().regex(/^[\t\x20-\x7e\x80-\xff]*$/, "Invalid header value"),
    )
    .default({}),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const { url, method, headers } = config;
    if (isSameHostAsApp(url)) {
      throw new PermanentChannelError(SAME_HOST_ERROR);
    }

    // non-JSON bodies are not stored raw, so they are relayed as the
    // stored message text (capped at 4000 chars). Store the raw body if a
    // text relay ever needs to be byte-exact.
    const body = notification.payload
      ? JSON.stringify(notification.payload)
      : notification.message;
    const original = notification.headers ?? {};

    const res = await fetchWithTimeout(url, {
      method,
      headers: {
        ...original,
        "content-type":
          original["content-type"] ??
          (notification.payload ? "application/json" : "text/plain; charset=utf-8"),
        ...headers,
        // Last, so neither the original request nor custom headers can drop it.
        ...traceHeaders(context.trace),
      },
      body,
    });
    await throwIfNotOk(res, "Forward");
  },
  async test(config) {
    const { url, method, headers } = config;
    if (isSameHostAsApp(url)) {
      throw new PermanentChannelError(SAME_HOST_ERROR);
    }
    const res = await fetchWithTimeout(url, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({
        message: "This is a test request from Alphorn. Real requests carry the original webhook body.",
        _test: true,
      }),
    });
    await throwIfNotOk(res, "Forward");
  },
});
