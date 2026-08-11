import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { PermanentChannelError, throwIfNotOk } from "./errors";
import { meta } from "./vonage-sms.meta";

// Vonage per-message statuses that retries can't fix: 2 missing params,
// 3 invalid params, 4 invalid credentials, 15 illegal sender.
const VONAGE_PERMANENT_STATUSES = ["2", "3", "4", "15"];

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
    const status = data.messages?.[0]?.status;
    if (status !== "0") {
      const msg = `Vonage error: ${data.messages?.[0]?.["error-text"] ?? "Unknown error"}`;
      if (status != null && VONAGE_PERMANENT_STATUSES.includes(status)) {
        throw new PermanentChannelError(msg);
      }
      throw new Error(msg);
    }
  },
});
