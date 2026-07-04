import type { ChannelMeta } from "./meta-types";
import { webhookUrlConfigField } from "./webhook-url-field";

export const meta: ChannelMeta = {
  type: "teams",
  displayName: "Microsoft Teams",
  description: "Send notifications to a Teams channel via webhook",
  icon: "microsoft-teams",
  hasTest: true,
  setupGuide: [
    "**Step 1: Open the channel or chat**",
    "In Microsoft Teams, open the channel or chat where you want notifications.",
    "",
    "**Step 2: Create a workflow**",
    'Click the **+** button or go to **Workflows**, then select **"Send webhook alerts to a channel"** (for channels) or **"Send webhook alerts to a chat"** (for chats).',
    "",
    "**Step 3: Copy the webhook URL**",
    "Follow the prompts to finish the workflow, then copy the generated webhook URL.",
  ].join("\n"),
  configFields: [
    webhookUrlConfigField({
      helpText: "From your Teams channel or chat workflow webhook",
      placeholder: "https://default<randomid>.environment.api.powerplatform.com:443/...",
    }),
  ],
};
