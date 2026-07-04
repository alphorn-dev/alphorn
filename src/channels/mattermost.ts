import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { meta } from "./mattermost.meta";

const configSchema = z.object({
  webhookUrl: z.string().url("Must be a valid URL"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { webhookUrl } = config;
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Alphorn",
        text: notification.title
          ? `**${notification.title}**\n${notification.message}`
          : notification.message,
      }),
    });
    await throwIfNotOk(res, "Mattermost webhook");
  },
});
