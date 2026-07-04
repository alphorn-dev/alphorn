import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "vonage-sms",
  displayName: "Vonage SMS",
  description: "Send SMS notifications via Vonage (Nexmo)",
  icon: "vonage",
  hasTest: true,
  setupGuide: [
    "**Step 1: Create a Vonage account**",
    "Sign up at [vonage.com](https://www.vonage.com) and find your **API Key** and **API Secret** on the dashboard.",
    "",
    "**Step 2: Get a virtual number**",
    "Buy a virtual number in the Vonage dashboard, or use an alphanumeric sender ID (where supported).",
    "",
    "**Step 3: Configure**",
    "Enter your API credentials, sender number/ID, and recipient number below.",
  ].join("\n"),
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
      helpText: "Your Vonage virtual number (E.164 format) or alphanumeric sender ID",
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
