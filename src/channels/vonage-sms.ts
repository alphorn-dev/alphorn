import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { meta } from "./vonage-sms.meta";

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  apiSecret: z.string().min(1, "API secret is required"),
  from: z.string().min(1, "From number/name is required"),
  to: z.string().min(1, "To number is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { apiKey, apiSecret, from, to } = config;
    const text = notification.title
      ? `${notification.title}: ${notification.message}`
      : notification.message;
    const res = await fetchWithTimeout("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        from,
        to,
        text,
      }),
    });
    await throwIfNotOk(res, "Vonage");
    const data = (await res.json()) as {
      messages: Array<{ status: string; "error-text"?: string }>;
    };
    if (data.messages?.[0]?.status !== "0") {
      throw new Error(
        `Vonage error: ${data.messages?.[0]?.["error-text"] ?? "Unknown error"}`
      );
    }
  },
});
