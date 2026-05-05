import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  webhookUrl: z.string().url("Must be a valid URL"),
});

registerChannel({
  type: "rocketchat",
  displayName: "Rocket.Chat",
  description: "Send notifications to a Rocket.Chat channel via webhook",
  icon: "rocketchat",
  configSchema,
  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "From Administration > Integrations > Incoming Webhook",
      placeholder: "https://rocketchat.example.com/hooks/...",
    },
  ],
  async send(config, notification) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: notification.title
          ? `**${notification.title}**\n${notification.message}`
          : notification.message,
      }),
    });
    await throwIfNotOk(res, "Rocket.Chat");
  },
  async test(config) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "**Alphorn Test**\nThis is a test message from Alphorn. If you see this, your Rocket.Chat channel is configured correctly.",
      }),
    });
    await throwIfNotOk(res, "Rocket.Chat");
  },
});
