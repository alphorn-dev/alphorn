import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { webhookUrlConfigSchema } from "./utils";
import { meta } from "./google-chat.meta";

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
        cards: [
          {
            ...(notification.title
              ? { header: { title: notification.title } }
              : {}),
            sections: [
              {
                widgets: [
                  { textParagraph: { text: notification.message } },
                ],
              },
            ],
          },
        ],
      }),
    });
    await throwIfNotOk(res, "Google Chat webhook");
  },
});
