import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { truncate } from "./truncate";
import { meta } from "./discord.meta";

// Discord embed limits: title 256 chars, description 4096 chars.
const DISCORD_TITLE_MAX = 256;
const DISCORD_DESCRIPTION_MAX = 4096;

const configSchema = z.object({
  webhookUrl: z.string().url("Must be a valid URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord webhook URL"),
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
        embeds: [
          {
            title: notification.title != null ? truncate(notification.title, DISCORD_TITLE_MAX) : undefined,
            description: truncate(notification.message, DISCORD_DESCRIPTION_MAX),
            color: 0x5865f2,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    await throwIfNotOk(res, "Discord webhook");
  },
  // Custom test: uses a distinct green accent color instead of the default send() blue.
  async test(config) {
    const { webhookUrl } = config;
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "Alphorn Test",
          description: "This is a test message from Alphorn. If you see this, your Discord channel is configured correctly.",
          color: 0x22c55e,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    await throwIfNotOk(res, "Discord webhook");
  },
});
