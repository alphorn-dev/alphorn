import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "sendgrid",
  displayName: "SendGrid",
  description: "Send email notifications via SendGrid",
  icon: "sendgrid",
  hasTest: true,
  setupGuide: [
    "**Step 1: Create an API key**",
    "In SendGrid, go to **Settings** > **API Keys** > **Create API Key**. Give it **Mail Send** permission.",
    "",
    "**Step 2: Verify a sender**",
    "Go to **Settings** > **Sender Authentication** and verify the email address or domain you'll send from.",
    "",
    "**Step 3: Configure**",
    "Enter your API key, verified sender address, and recipient email below.",
  ].join("\n"),
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      helpText: "From Settings > API Keys > Create API Key (needs Mail Send permission)",
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
};
