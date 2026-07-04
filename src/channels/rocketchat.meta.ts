import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "rocketchat",
  displayName: "Rocket.Chat",
  description: "Send notifications to a Rocket.Chat channel via webhook",
  icon: "rocketchat",
  hasTest: true,
  setupGuide: [
    "**Step 1: Enable incoming webhooks**",
    "In Rocket.Chat, go to **Administration** > **Workspace** > **Integrations** and enable incoming webhooks.",
    "",
    "**Step 2: Create a webhook**",
    "Click **New Integration** > **Incoming Webhook**. Select the channel and configure a name.",
    "",
    "**Step 3: Copy the URL**",
    "Save the integration and copy the **Webhook URL** provided.",
  ].join("\n"),
  configFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "From Administration > Integrations > Incoming Webhook",
      placeholder: "https://rocketchat.example.com/hooks/...",
    },
  ],
};
