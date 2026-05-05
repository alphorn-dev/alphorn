import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  webhookUrl: z.string().url("Must be a valid URL"),
});

registerChannel({
  type: "google-chat",
  displayName: "Google Chat",
  description: "Send notifications to a Google Chat space via webhook",
  icon: "google-chat",
  configSchema,
  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "From your Google Chat space's webhook settings",
      placeholder: "https://chat.googleapis.com/v1/spaces/.../messages?key=...",
    },
  ],
  async send(config, notification) {
    const { webhookUrl } = configSchema.parse(config);
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
  async test(config) {
    const { webhookUrl } = configSchema.parse(config);
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [
          {
            header: { title: "Alphorn Test" },
            sections: [
              {
                widgets: [
                  {
                    textParagraph: {
                      text: "This is a test message from Alphorn. If you see this, your Google Chat space is configured correctly.",
                    },
                  },
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
