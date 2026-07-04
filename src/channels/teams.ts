import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { webhookUrlConfigSchema } from "./utils";
import { meta } from "./teams.meta";

const configSchema = webhookUrlConfigSchema();

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { webhookUrl } = config;
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
});
