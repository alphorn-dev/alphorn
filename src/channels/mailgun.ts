import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { subjectFallback } from "./subject";
import { throwIfNotOk } from "./errors";
import { truncate } from "./truncate";
import { basicAuthHeader } from "./utils";
import { meta } from "./mailgun.meta";

// RFC 5322 caps a header line (Subject) at 998 chars. The body has no limit.
const SUBJECT_MAX = 998;

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

    const res = await fetchWithTimeout(`${baseUrl}/v3/${encodeURIComponent(domain)}/messages`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader("api", apiKey),
      },
      body: new URLSearchParams({
        from,
        to,
        subject: truncate(subjectFallback(notification.title, notification.message), SUBJECT_MAX),
        text: notification.message,
      }),
    });
    await throwIfNotOk(res, "Mailgun");
  },
});
