import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { webhookUrlConfigSchema } from "./utils";
import { meta } from "./slack.meta";

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
});
