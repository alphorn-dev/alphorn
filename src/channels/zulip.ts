import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { basicAuthHeader, joinUrl } from "./utils";
import { meta } from "./zulip.meta";

const configSchema = z.object({
  serverUrl: z.string().url("Must be a valid URL"),
  botEmail: z.string().email("Must be a valid email"),
  apiKey: z.string().min(1, "API key is required"),
  stream: z.string().min(1, "Stream name is required"),
  topic: z.string().min(1, "Topic is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { serverUrl, botEmail, apiKey, stream, topic } = config;
    const content = notification.title
      ? `**${notification.title}**\n${notification.message}`
      : notification.message;
    const res = await fetchWithTimeout(
      joinUrl(serverUrl, "api/v1/messages"),
      {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(botEmail, apiKey),
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
