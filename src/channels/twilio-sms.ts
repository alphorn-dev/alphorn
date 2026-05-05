import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  accountSid: z.string().min(1, "Account SID is required"),
  authToken: z.string().min(1, "Auth token is required"),
  from: z.string().min(1, "From number is required"),
  to: z.string().min(1, "To number is required"),
});

registerChannel({
  type: "twilio-sms",
  displayName: "Twilio SMS",
  description: "Send notifications via SMS using Twilio",
  icon: "twilio",
  configSchema,
  configFields: [
    {
      key: "accountSid",
      label: "Account SID",
      type: "text",
      required: true,
      helpText: "From your Twilio console dashboard",
      placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
    {
      key: "authToken",
      label: "Auth Token",
      type: "password",
      required: true,
      helpText: "From your Twilio console dashboard",
    },
    {
      key: "from",
      label: "From Number",
      type: "text",
      required: true,
      helpText: "Your Twilio phone number in E.164 format",
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
    const { accountSid, authToken, from, to } = configSchema.parse(config);
    const body = notification.title
      ? `${notification.title}: ${notification.message}`
      : notification.message;
    const res = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    );
    await throwIfNotOk(res, "Twilio");
  },
  async test(config) {
    const { accountSid, authToken, from, to } = configSchema.parse(config);
    const res = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
        body: new URLSearchParams({
          To: to,
          From: from,
          Body: "Alphorn Test: This is a test message from Alphorn. If you receive this, your Twilio SMS channel is configured correctly.",
        }),
      }
    );
    await throwIfNotOk(res, "Twilio");
  },
});
