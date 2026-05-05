import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  serverUrl: z.string().url("Must be a valid URL"),
  botEmail: z.string().email("Must be a valid email"),
  apiKey: z.string().min(1, "API key is required"),
  stream: z.string().min(1, "Stream name is required"),
  topic: z.string().min(1, "Topic is required"),
});

registerChannel({
  type: "zulip",
  displayName: "Zulip",
  description: "Send notifications to a Zulip stream",
  icon: "zulip",
  configSchema,
  configFields: [
    {
      key: "serverUrl",
      label: "Server URL",
      type: "text",
      required: true,
      helpText: "Your Zulip server URL",
      placeholder: "https://yourorg.zulipchat.com",
    },
    {
      key: "botEmail",
      label: "Bot Email",
      type: "text",
      required: true,
      helpText: "The bot's email address from Settings > Your Bots",
      placeholder: "my-bot@yourorg.zulipchat.com",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      helpText: "The bot's API key from Settings > Your Bots",
    },
    {
      key: "stream",
      label: "Stream",
      type: "text",
      required: true,
      helpText: "The stream (channel) to post to",
      placeholder: "general",
    },
    {
      key: "topic",
      label: "Topic",
      type: "text",
      required: true,
      helpText: "The topic within the stream",
      placeholder: "notifications",
    },
  ],
  async send(config, notification) {
    const { serverUrl, botEmail, apiKey, stream, topic } =
      configSchema.parse(config);
    const content = notification.title
      ? `**${notification.title}**\n${notification.message}`
      : notification.message;
    const res = await fetchWithTimeout(
      `${serverUrl.replace(/\/$/, "")}/api/v1/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${botEmail}:${apiKey}`)}`,
        },
        body: new URLSearchParams({
          type: "stream",
          to: stream,
          topic,
          content,
        }),
      }
    );
    await throwIfNotOk(res, "Zulip");
  },
  async test(config) {
    const { serverUrl, botEmail, apiKey, stream, topic } =
      configSchema.parse(config);
    const res = await fetchWithTimeout(
      `${serverUrl.replace(/\/$/, "")}/api/v1/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${botEmail}:${apiKey}`)}`,
        },
        body: new URLSearchParams({
          type: "stream",
          to: stream,
          topic,
          content:
            "**Alphorn Test**\nThis is a test message from Alphorn. If you see this, your Zulip channel is configured correctly.",
        }),
      }
    );
    await throwIfNotOk(res, "Zulip");
  },
});
