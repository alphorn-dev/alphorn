import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { subjectFallback } from "./subject";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  from: z.string().email("Must be a valid email"),
  fromName: z.string().optional(),
  to: z.string().min(1, "Recipient is required"),
});

registerChannel({
  type: "sendgrid",
  displayName: "SendGrid",
  description: "Send email notifications via SendGrid",
  icon: "sendgrid",
  configSchema,
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      helpText:
        "From Settings > API Keys > Create API Key (needs Mail Send permission)",
    },
    {
      key: "from",
      label: "From Email",
      type: "text",
      required: true,
      helpText: "Must be a verified sender in SendGrid",
      placeholder: "notifications@example.com",
    },
    {
      key: "fromName",
      label: "From Name",
      type: "text",
      helpText: "Display name for the sender (optional)",
      placeholder: "Alphorn Notifications",
    },
    {
      key: "to",
      label: "To Email",
      type: "text",
      required: true,
      helpText: "Recipient email. Separate multiple with commas",
      placeholder: "you@example.com",
    },
  ],
  async send(config, notification) {
    const { apiKey, from, fromName, to } = configSchema.parse(config);
    const toAddresses = to.split(",").map((e) => ({ email: e.trim() }));
    const res = await fetchWithTimeout("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: toAddresses }],
        from: { email: from, name: fromName || undefined },
        subject: subjectFallback(notification.title, notification.message),
        content: [{ type: "text/plain", value: notification.message }],
      }),
    });
    await throwIfNotOk(res, "SendGrid");
  },
  async test(config) {
    const { apiKey, from, fromName, to } = configSchema.parse(config);
    const toAddresses = to.split(",").map((e) => ({ email: e.trim() }));
    const res = await fetchWithTimeout("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: toAddresses }],
        from: { email: from, name: fromName || undefined },
        subject: "Alphorn Test",
        content: [
          {
            type: "text/plain",
            value:
              "This is a test email from Alphorn. If you receive this, your SendGrid channel is configured correctly.",
          },
        ],
      }),
    });
    await throwIfNotOk(res, "SendGrid");
  },
});
