import type { ChannelMeta } from "./meta-types";
import { webhookUrlConfigField } from "./webhook-url-field";

export const meta: ChannelMeta = {
  type: "google-chat",
  displayName: "Google Chat",
  description: "Send notifications to a Google Chat space via webhook",
  icon: "google-chat",
  hasTest: true,
  setupGuide: [
    "**Step 1: Open the space**",
    "In Google Chat, open the space where you want notifications.",
    "",
    "**Step 2: Create a webhook**",
    "Click the space name at the top > **Apps & integrations** > **Webhooks** > **Create**.",
    "",
    "**Step 3: Copy the URL**",
    "Give the webhook a name, optionally set an avatar, and copy the webhook URL.",
  ].join("\n"),
  configFields: [
    webhookUrlConfigField({
      helpText: "From your Google Chat space's webhook settings",
      placeholder: "https://chat.googleapis.com/v1/spaces/.../messages?key=...",
    }),
  ],
};
