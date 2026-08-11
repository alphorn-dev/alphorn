import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { subjectFallback } from "./subject";
import { throwIfNotOk } from "./errors";
import { truncate } from "./truncate";
import { meta } from "./sendgrid.meta";

// RFC 5322 caps a header line (Subject) at 998 chars. The body has no limit.
const SUBJECT_MAX = 998;

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  from: z.string().email("Must be a valid email"),
  fromName: z.string().optional(),
  to: z.string().min(1, "Recipient is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { apiKey, from, fromName, to } = config;
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
        subject: truncate(subjectFallback(notification.title, notification.message), SUBJECT_MAX),
        content: [{ type: "text/plain", value: notification.message }],
      }),
    });
    await throwIfNotOk(res, "SendGrid");
  },
});
