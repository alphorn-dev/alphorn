import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "opsgenie",
  displayName: "Opsgenie",
  description: "Create alerts in Opsgenie",
  icon: "opsgenie",
  hasTest: true,
  setupGuide: [
    "**Step 1: Create an API integration**",
    "In Opsgenie, go to **Settings** > **Integration List** > **API** > **Add**.",
    "",
    "**Step 2: Copy the API key**",
    "Copy the **API Key** from the integration settings. Use a 'Create and Close' API integration for full functionality.",
    "",
    "**Step 3: Choose your region**",
    "Select US or EU based on your Opsgenie instance URL (app.opsgenie.com = US, app.eu.opsgenie.com = EU).",
  ].join("\n"),
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      helpText: "From Settings > Integration List > API > Add. Use a 'Create and Close' API integration.",
    },
    {
      key: "region",
      label: "Region",
      type: "select",
      required: true,
      helpText: "Your Opsgenie instance region",
      options: [
        { label: "US (api.opsgenie.com)", value: "us" },
        { label: "EU (api.eu.opsgenie.com)", value: "eu" },
      ],
    },
    {
      key: "priority",
      label: "Default Priority",
      type: "select",
      required: true,
      helpText: "Default priority for created alerts",
      options: [
        { label: "P1 - Critical", value: "P1" },
        { label: "P2 - High", value: "P2" },
        { label: "P3 - Moderate", value: "P3" },
        { label: "P4 - Low", value: "P4" },
        { label: "P5 - Informational", value: "P5" },
      ],
    },
  ],
};
