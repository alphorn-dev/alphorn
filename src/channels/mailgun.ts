import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { subjectFallback } from "./subject";
import { throwIfNotOk } from "./errors";
import { meta } from "./mailgun.meta";

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  domain: z.string().min(1, "Domain is required"),
  region: z.enum(["us", "eu"]).default("us"),
  from: z.string().min(1, "From address is required"),
  to: z.string().min(1, "Recipient is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { apiKey, domain, region, from, to } = config;
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
});
