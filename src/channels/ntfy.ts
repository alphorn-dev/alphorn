import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  serverUrl: z
    .string()
    .url("Must be a valid URL")
    .default("https://ntfy.sh"),
  topic: z.string().min(1, "Topic is required"),
  accessToken: z.string().optional(),
});

registerChannel({
  type: "ntfy",
  displayName: "Ntfy",
  description: "Send push notifications via ntfy (self-hostable)",
  icon: "ntfy",
  configSchema,
  configFields: [
    {
      key: "serverUrl",
      label: "Server URL",
      type: "text",
      required: true,
      helpText:
        "Use https://ntfy.sh for the public server or your self-hosted instance URL",
      placeholder: "https://ntfy.sh",
    },
    {
      key: "topic",
      label: "Topic",
      type: "text",
      required: true,
      helpText: "The topic name to publish to (e.g. my-notifications)",
      placeholder: "my-notifications",
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      helpText: "Optional. Required for private/protected topics",
    },
  ],
  async send(config, notification) {
    const { serverUrl, topic, accessToken } = configSchema.parse(config);
    const headers: Record<string, string> = {};
    if (notification.title) {
      headers["X-Title"] = notification.title;
    }
    if (notification.priority != null) {
      const priorityMap: Record<number, string> = {
        1: "min",
        2: "low",
        3: "default",
        4: "high",
        5: "urgent",
      };
      headers["X-Priority"] = priorityMap[notification.priority] ?? "default";
    }
    if (notification.tags?.length) {
      headers["X-Tags"] = notification.tags.join(",");
    }
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const res = await fetchWithTimeout(
      `${serverUrl.replace(/\/$/, "")}/${topic}`,
      {
        method: "POST",
        headers,
        body: notification.message,
      }
    );
    await throwIfNotOk(res, "Ntfy");
  },
  async test(config) {
    const { serverUrl, topic, accessToken } = configSchema.parse(config);
    const headers: Record<string, string> = {
      "X-Title": "Alphorn Test",
      "X-Tags": "white_check_mark",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const res = await fetchWithTimeout(
      `${serverUrl.replace(/\/$/, "")}/${topic}`,
      {
        method: "POST",
        headers,
        body: "This is a test message from Alphorn. If you see this, your ntfy topic is configured correctly.",
      }
    );
    await throwIfNotOk(res, "Ntfy");
  },
});
