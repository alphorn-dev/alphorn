import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  apiToken: z.string().min(1, "API token is required"),
  userKey: z.string().min(1, "User key is required"),
});

registerChannel({
  type: "pushover",
  displayName: "Pushover",
  description: "Send push notifications via Pushover",
  icon: "pushover",
  configSchema,
  configFields: [
    {
      key: "apiToken",
      label: "API Token",
      type: "password",
      required: true,
      helpText: "From your Pushover application settings",
    },
    {
      key: "userKey",
      label: "User Key",
      type: "password",
      required: true,
      helpText: "Your Pushover user key, found on your dashboard",
    },
  ],
  async send(config, notification) {
    const { apiToken, userKey } = configSchema.parse(config);
    const params = new URLSearchParams({
      token: apiToken,
      user: userKey,
      message: notification.message,
    });
    if (notification.title) {
      params.set("title", notification.title);
    }
    if (notification.priority != null) {
      const p = notification.priority;
      const mapped = p <= 2 ? -1 : p === 3 ? 0 : p === 4 ? 1 : 2;
      params.set("priority", String(mapped));
      if (mapped === 2) {
        params.set("retry", "60");
        params.set("expire", "3600");
      }
    }
    const res = await fetchWithTimeout("https://api.pushover.net/1/messages.json", {
      method: "POST",
      body: params,
    });
    await throwIfNotOk(res, "Pushover");
  },
  async test(config) {
    const { apiToken, userKey } = configSchema.parse(config);
    const res = await fetchWithTimeout("https://api.pushover.net/1/messages.json", {
      method: "POST",
      body: new URLSearchParams({
        token: apiToken,
        user: userKey,
        title: "Alphorn Test",
        message:
          "This is a test message from Alphorn. If you see this, your Pushover channel is configured correctly.",
      }),
    });
    await throwIfNotOk(res, "Pushover");
  },
});
