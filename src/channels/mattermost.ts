import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  webhookUrl: z.string().url("Must be a valid URL"),
});

registerChannel({
  type: "mattermost",
  displayName: "Mattermost",
  description: "Send notifications to a Mattermost channel via webhook",
  icon: "mattermost",
  configSchema,
  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "From Mattermost: Integrations > Incoming Webhooks",
      placeholder: "https://mattermost.example.com/hooks/...",
    },
  ],
  async send(config, notification) {
    const { webhookUrl } = configSchema.parse(config);
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
  async test(config) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Alphorn",
        text: "**Alphorn Test**\nThis is a test message from Alphorn. If you see this, your Mattermost channel is configured correctly.",
      }),
    });
    await throwIfNotOk(res, "Mattermost webhook");
  },
});
