import type { ChannelMeta } from "./meta-types";
import { webhookUrlConfigField } from "./webhook-url-field";

export const meta: ChannelMeta = {
  type: "mattermost",
  displayName: "Mattermost",
  description: "Send notifications to a Mattermost channel via webhook",
  icon: "mattermost",
  hasTest: true,
  setupGuide: [
    "**Step 1: Enable incoming webhooks**",
    "In Mattermost, go to **System Console** > **Integrations** > **Integration Management** and enable incoming webhooks.",
    "",
    "**Step 2: Create a webhook**",
    "Go to **Integrations** > **Incoming Webhooks** > **Add Incoming Webhook**. Select the channel and save.",
    "",
    "**Step 3: Copy the URL**",
    "Copy the webhook URL provided after creation.",
  ].join("\n"),
  configFields: [
    webhookUrlConfigField({
      helpText: "From Mattermost: Integrations > Incoming Webhooks",
      placeholder: "https://mattermost.example.com/hooks/...",
    }),
  ],
};
