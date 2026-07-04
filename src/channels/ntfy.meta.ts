import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "ntfy",
  displayName: "Ntfy",
  description: "Send push notifications via ntfy (self-hostable)",
  icon: "ntfy",
  hasTest: true,
  setupGuide: [
    "**Step 1: Choose a server**",
    "Use the public server at `https://ntfy.sh` or [self-host your own](https://docs.ntfy.sh/install/).",
    "",
    "**Step 2: Pick a topic**",
    "Choose a unique topic name (e.g. `my-server-alerts`). Anyone who knows the topic name can subscribe, so make it hard to guess.",
    "",
    "**Step 3: Subscribe**",
    "Install the ntfy app on your phone or use the web UI at `https://ntfy.sh/my-topic` to subscribe.",
    "",
    "**Optional: Access token**",
    "If your server requires authentication, create an access token in your ntfy server settings.",
  ].join("\n"),
  configFields: [
    {
      key: "serverUrl",
      label: "Server URL",
      type: "text",
      required: true,
      helpText: "Use https://ntfy.sh for the public server or your self-hosted instance URL",
      placeholder: "https://ntfy.sh",
    },
    {
      key: "topic",
      label: "Topic",
      type: "text",
      required: true,
      helpText: "The topic name to publish to (e.g. my-notifications)",
      placeholder: "my-notifications",
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      helpText: "Optional. Required for private/protected topics",
    },
  ],
};
