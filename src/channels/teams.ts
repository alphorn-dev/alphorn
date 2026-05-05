import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  webhookUrl: z.string().url("Must be a valid URL"),
});

registerChannel({
  type: "teams",
  displayName: "Microsoft Teams",
  description: "Send notifications to a Teams channel via webhook",
  icon: "microsoft-teams",
  configSchema,
  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "From your Teams channel or chat workflow webhook",
      placeholder:
        "https://default<randomid>.environment.api.powerplatform.com:443/...",
    },
  ],
  async send(config, notification) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                ...(notification.title
                  ? [
                      {
                        type: "TextBlock",
                        text: notification.title,
                        weight: "Bolder",
                        size: "Medium",
                      },
                    ]
                  : []),
                {
                  type: "TextBlock",
                  text: notification.message,
                  wrap: true,
                },
              ],
            },
          },
        ],
      }),
    });
    await throwIfNotOk(res, "Teams webhook");
  },
  async test(config) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                {
                  type: "TextBlock",
                  text: "Alphorn Test",
                  weight: "Bolder",
                  size: "Medium",
                },
                {
                  type: "TextBlock",
                  text: "This is a test message from Alphorn. If you see this, your Teams channel is configured correctly.",
                  wrap: true,
                },
              ],
            },
          },
        ],
      }),
    });
    await throwIfNotOk(res, "Teams webhook");
  },
});
