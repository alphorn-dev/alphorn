import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  webhookUrl: z.string().url("Must be a valid URL").startsWith("https://discord.com/api/webhooks/", "Must be a Discord webhook URL"),
});

registerChannel({
  type: "discord",
  displayName: "Discord",
  description: "Send notifications to a Discord channel via webhook",
  icon: "discord",
  setupGuide: [
    "1. Open your Discord server settings",
    "2. Go to **Integrations** > **Webhooks**",
    "3. Click **New Webhook** and select the target channel",
    "4. Copy the webhook URL",
  ].join("\n"),
  configSchema,
  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "Found in Server Settings > Integrations > Webhooks",
      placeholder: "https://discord.com/api/webhooks/...",
    },
  ],
  async send(config, notification) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: notification.title ?? undefined,
            description: notification.message,
            color: 0x5865f2,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    await throwIfNotOk(res, "Discord webhook");
  },
  async test(config) {
    const { webhookUrl } = configSchema.parse(config);
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
