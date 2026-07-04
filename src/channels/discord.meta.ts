import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "discord",
  displayName: "Discord",
  description: "Send notifications to a Discord channel via webhook",
  icon: "discord",
  hasTest: true,
  setupGuide: [
    "1. Open your Discord server settings",
    "2. Go to **Integrations** > **Webhooks**",
    "3. Click **New Webhook** and select the target channel",
    "4. Copy the webhook URL",
  ].join("\n"),
  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "Found in Server Settings > Integrations > Webhooks",
      placeholder: "https://discord.com/api/webhooks/...",
    },
  ],
};
