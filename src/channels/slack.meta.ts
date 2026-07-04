import type { ChannelMeta } from "./meta-types";
import { webhookUrlConfigField } from "./webhook-url-field";

export const meta: ChannelMeta = {
  type: "slack",
  displayName: "Slack",
  description: "Send notifications to a Slack channel via webhook",
  icon: "slack",
  hasTest: true,
  setupGuide: [
    "**Step 1: Create a Slack App**",
    "Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**. Choose a name and workspace.",
    "",
    "**Step 2: Enable Incoming Webhooks**",
    "In your app settings, go to **Incoming Webhooks** and toggle it on.",
    "",
    "**Step 3: Create a Webhook URL**",
    "Click **Add New Webhook to Workspace**, select the channel you want notifications in, and click **Allow**. Copy the webhook URL.",
  ].join("\n"),
  configFields: [
    webhookUrlConfigField({
      helpText: "From your Slack app's Incoming Webhooks settings",
      placeholder: "https://hooks.slack.com/services/...",
    }),
  ],
};
