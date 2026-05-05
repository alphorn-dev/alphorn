import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  apiSecret: z.string().min(1, "API secret is required"),
  from: z.string().min(1, "From number/name is required"),
  to: z.string().min(1, "To number is required"),
});

registerChannel({
  type: "vonage-sms",
  displayName: "Vonage SMS",
  description: "Send SMS notifications via Vonage (Nexmo)",
  icon: "vonage",
  configSchema,
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      required: true,
      helpText: "From your Vonage API dashboard",
      placeholder: "a1b2c3d4",
    },
    {
      key: "apiSecret",
      label: "API Secret",
      type: "password",
      required: true,
      helpText: "From your Vonage API dashboard",
    },
    {
      key: "from",
      label: "From",
      type: "text",
      required: true,
      helpText:
        "Your Vonage virtual number (E.164 format) or alphanumeric sender ID",
      placeholder: "+15551234567",
    },
    {
      key: "to",
      label: "To Number",
      type: "text",
      required: true,
      helpText: "Recipient phone number in E.164 format",
      placeholder: "+15559876543",
    },
  ],
  async send(config, notification) {
    const { apiKey, apiSecret, from, to } = configSchema.parse(config);
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
  async test(config) {
    const { apiKey, apiSecret, from, to } = configSchema.parse(config);
    const res = await fetchWithTimeout("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        from,
        to,
        text: "Alphorn Test: This is a test message from Alphorn. If you receive this, your Vonage SMS channel is configured correctly.",
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
