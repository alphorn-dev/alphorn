import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { webhookUrlConfigSchema } from "./utils";
import { truncate } from "./truncate";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./google-chat.meta";

// Google Chat caps a textParagraph widget at 4096 chars.
const GOOGLE_CHAT_TEXT_MAX = 4096;

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
        cards: [
          {
            ...(notification.title
              ? { header: { title: notification.title } }
              : {}),
            sections: [
              {
                widgets: [
                  { textParagraph: { text: truncate(notification.message, GOOGLE_CHAT_TEXT_MAX) } },
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
