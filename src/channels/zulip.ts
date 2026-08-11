import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { basicAuthHeader, joinUrl, refineNotAppHost } from "./utils";
import { truncate } from "./truncate";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./zulip.meta";

// Zulip rejects message content longer than 10000 chars.
const ZULIP_CONTENT_MAX = 10000;

const configSchema = z.object({
  serverUrl: refineNotAppHost(z.string().url("Must be a valid URL")),
  botEmail: z.string().email("Must be a valid email"),
  apiKey: z.string().min(1, "API key is required"),
  stream: z.string().min(1, "Stream name is required"),
  topic: z.string().min(1, "Topic is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const { serverUrl, botEmail, apiKey, stream, topic } = config;
    const content = truncate(
      notification.title
        ? `**${notification.title}**\n${notification.message}`
        : notification.message,
      ZULIP_CONTENT_MAX,
    );
    const res = await fetchWithTimeout(
      joinUrl(serverUrl, "api/v1/messages"),
      {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(botEmail, apiKey),
          ...traceHeaders(context.trace),
        },
        body: new URLSearchParams({
          type: "stream",
          to: stream,
          topic,
          content,
        }),
      }
    );
    await throwIfNotOk(res, "Zulip");
  },
});
