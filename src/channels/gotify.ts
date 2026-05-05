import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  serverUrl: z.string().url("Must be a valid URL"),
  appToken: z.string().min(1, "App token is required"),
});

registerChannel({
  type: "gotify",
  displayName: "Gotify",
  description: "Send push notifications via Gotify (self-hostable)",
  icon: "gotify",
  configSchema,
  configFields: [
    {
      key: "serverUrl",
      label: "Server URL",
      type: "text",
      required: true,
      helpText: "Your Gotify server URL",
      placeholder: "https://gotify.example.com",
    },
    {
      key: "appToken",
      label: "App Token",
      type: "password",
      required: true,
      helpText: "From Gotify: Apps > Create Application > copy token",
    },
  ],
  async send(config, notification) {
    const { serverUrl, appToken } = configSchema.parse(config);
    const res = await fetchWithTimeout(`${serverUrl.replace(/\/$/, "")}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gotify-Key": appToken,
      },
      body: JSON.stringify({
        ...(notification.title ? { title: notification.title } : {}),
        message: notification.message,
        priority: notification.priority ?? 5,
      }),
    });
    await throwIfNotOk(res, "Gotify");
  },
  async test(config) {
    const { serverUrl, appToken } = configSchema.parse(config);
    const res = await fetchWithTimeout(`${serverUrl.replace(/\/$/, "")}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gotify-Key": appToken,
      },
      body: JSON.stringify({
        title: "Alphorn Test",
        message:
          "This is a test message from Alphorn. If you see this, your Gotify channel is configured correctly.",
        priority: 5,
      }),
    });
    await throwIfNotOk(res, "Gotify");
  },
});
