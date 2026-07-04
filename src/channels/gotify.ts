import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { meta } from "./gotify.meta";

const configSchema = z.object({
  serverUrl: z.string().url("Must be a valid URL"),
  appToken: z.string().min(1, "App token is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { serverUrl, appToken } = config;
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
});
