import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "pushover",
  displayName: "Pushover",
  description: "Send push notifications via Pushover",
  icon: "pushover",
  hasTest: true,
  setupGuide: [
    "**Step 1: Create an account**",
    "Sign up at [pushover.net](https://pushover.net). Your **User Key** is shown on the dashboard.",
    "",
    "**Step 2: Create an application**",
    "Go to [pushover.net/apps/build](https://pushover.net/apps/build) and create an application. Copy the **API Token**.",
    "",
    "**Step 3: Install the app**",
    "Install the Pushover app on your phone or desktop to receive notifications.",
  ].join("\n"),
  configFields: [
    {
      key: "apiToken",
      label: "API Token",
      type: "password",
      required: true,
      helpText: "From your Pushover application settings",
    },
    {
      key: "userKey",
      label: "User Key",
      type: "password",
      required: true,
      helpText: "Your Pushover user key, found on your dashboard",
    },
  ],
};
