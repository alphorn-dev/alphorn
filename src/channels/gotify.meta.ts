import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "gotify",
  displayName: "Gotify",
  description: "Send push notifications via Gotify (self-hostable)",
  icon: "gotify",
  hasTest: true,
  setupGuide: [
    "**Step 1: Set up Gotify**",
    "[Self-host Gotify](https://gotify.net/docs/install) or use an existing instance.",
    "",
    "**Step 2: Create an application**",
    "In the Gotify web UI, go to **Apps** > **Create Application**. Copy the **App Token**.",
    "",
    "**Step 3: Subscribe**",
    "Install the Gotify app on your phone or use the web UI to see notifications.",
  ].join("\n"),
  configFields: [
    {
      key: "serverUrl",
      label: "Server URL",
      type: "text",
      required: true,
      helpText: "Your Gotify server URL",
      placeholder: "https://gotify.example.com",
    },
    {
      key: "appToken",
      label: "App Token",
      type: "password",
      required: true,
      helpText: "From Gotify: Apps > Create Application > copy token",
    },
  ],
};
