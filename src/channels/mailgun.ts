import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { subjectFallback } from "./subject";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  domain: z.string().min(1, "Domain is required"),
  region: z.enum(["us", "eu"]).default("us"),
  from: z.string().min(1, "From address is required"),
  to: z.string().min(1, "Recipient is required"),
});

registerChannel({
  type: "mailgun",
  displayName: "Mailgun",
  description: "Send email notifications via Mailgun",
  icon: "mailgun",
  configSchema,
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      helpText: "From Mailgun dashboard > API Keys (use the private API key)",
    },
    {
      key: "domain",
      label: "Domain",
      type: "text",
      required: true,
      helpText: "Your verified Mailgun sending domain",
      placeholder: "mg.example.com",
    },
    {
      key: "region",
      label: "Region",
      type: "select",
      required: true,
      helpText: "Your Mailgun region",
      options: [
        { label: "US (api.mailgun.net)", value: "us" },
        { label: "EU (api.eu.mailgun.net)", value: "eu" },
      ],
    },
    {
      key: "from",
      label: "From Address",
      type: "text",
      required: true,
      helpText: "Sender address (must match your verified domain)",
      placeholder: "Alphorn <notifications@mg.example.com>",
    },
    {
      key: "to",
      label: "To Address",
      type: "text",
      required: true,
      helpText: "Recipient email. Separate multiple with commas",
      placeholder: "you@example.com",
    },
  ],
  async send(config, notification) {
    const { apiKey, domain, region, from, to } = configSchema.parse(config);
    const baseUrl =
      region === "eu"
        ? "https://api.eu.mailgun.net"
        : "https://api.mailgun.net";

    const res = await fetchWithTimeout(`${baseUrl}/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      },
      body: new URLSearchParams({
        from,
        to,
        subject: subjectFallback(notification.title, notification.message),
        text: notification.message,
      }),
    });
    await throwIfNotOk(res, "Mailgun");
  },
  async test(config) {
    const { apiKey, domain, region, from, to } = configSchema.parse(config);
    const baseUrl =
      region === "eu"
        ? "https://api.eu.mailgun.net"
        : "https://api.mailgun.net";

    const res = await fetchWithTimeout(`${baseUrl}/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      },
      body: new URLSearchParams({
        from,
        to,
        subject: "Alphorn Test",
        text: "This is a test email from Alphorn. If you receive this, your Mailgun channel is configured correctly.",
      }),
    });
    await throwIfNotOk(res, "Mailgun");
  },
});
