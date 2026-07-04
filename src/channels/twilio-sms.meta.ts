import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "twilio-sms",
  displayName: "Twilio SMS",
  description: "Send notifications via SMS using Twilio",
  icon: "twilio",
  hasTest: true,
  setupGuide: [
    "**Step 1: Create a Twilio account**",
    "Sign up at [twilio.com](https://www.twilio.com). Find your **Account SID** and **Auth Token** on the console dashboard.",
    "",
    "**Step 2: Get a phone number**",
    "Buy or verify a phone number in the Twilio console. This will be your **From** number.",
    "",
    "**Step 3: Add recipient**",
    "Enter the recipient phone number in E.164 format (e.g. `+15551234567`). For trial accounts, verify the number first.",
  ].join("\n"),
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
};
