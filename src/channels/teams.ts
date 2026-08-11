import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { webhookUrlConfigSchema } from "./utils";
import { truncate } from "./truncate";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./teams.meta";

// Adaptive Cards payloads are capped at 28 KB; the message TextBlock is the
// only unbounded field, so truncate it to keep the card under the limit.
const TEAMS_TEXT_MAX = 28000;

const configSchema = webhookUrlConfigSchema();

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const { webhookUrl } = config;
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...traceHeaders(context.trace) },
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
                  text: truncate(notification.message, TEAMS_TEXT_MAX),
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
