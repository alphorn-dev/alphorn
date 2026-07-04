import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "mailgun",
  displayName: "Mailgun",
  description: "Send email notifications via Mailgun",
  icon: "mailgun",
  hasTest: true,
  setupGuide: [
    "**Step 1: Get your API key**",
    "In Mailgun, go to your dashboard and find your **Private API Key** under API Keys.",
    "",
    "**Step 2: Set up a domain**",
    "Go to **Sending** > **Domains** and add/verify a sending domain (e.g. `mg.example.com`).",
    "",
    "**Step 3: Configure**",
    "Enter your API key, sending domain, and email addresses below. Choose US or EU based on your Mailgun region.",
  ].join("\n"),
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      helpText: "Your private API key from the Mailgun dashboard",
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
};
