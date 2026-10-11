import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { basicAuthHeader } from "./utils";
import { truncate } from "./truncate";
import { meta } from "./twilio-sms.meta";

// Twilio rejects message bodies over 1600 chars.
const TWILIO_BODY_MAX = 1600;

const configSchema = z.object({
  accountSid: z.string().min(1, "Account SID is required"),
  authToken: z.string().min(1, "Auth token is required"),
  from: z.string().min(1, "From number is required"),
  to: z.string().min(1, "To number is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { accountSid, authToken, from, to } = config;
    const body = notification.title
      ? `${notification.title}: ${notification.message}`
      : notification.message;
    const res = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(accountSid, authToken),
        },
        body: new URLSearchParams({ To: to, From: from, Body: truncate(body, TWILIO_BODY_MAX) }),
      }
    );
    await throwIfNotOk(res, "Twilio");
  },
});
