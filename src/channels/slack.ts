import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  webhookUrl: z.string().url("Must be a valid URL"),
});

registerChannel({
  type: "slack",
  displayName: "Slack",
  description: "Send notifications to a Slack channel via webhook",
  icon: "slack",
  configSchema,
  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "From your Slack app's Incoming Webhooks settings",
      placeholder: "https://hooks.slack.com/services/...",
    },
  ],
  async send(config, notification) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          ...(notification.title
            ? [
                {
                  type: "header",
                  text: { type: "plain_text", text: notification.title },
                },
              ]
            : []),
          {
            type: "section",
            text: { type: "mrkdwn", text: notification.message },
          },
        ],
      }),
    });
    await throwIfNotOk(res, "Slack webhook");
  },
  async test(config) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "Alphorn Test" },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "This is a test message from Alphorn. If you see this, your Slack channel is configured correctly.",
            },
          },
        ],
      }),
    });
    await throwIfNotOk(res, "Slack webhook");
  },
});
