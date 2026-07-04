import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "pagerduty",
  displayName: "PagerDuty",
  description: "Create incidents in PagerDuty via Events API v2",
  icon: "pagerduty",
  hasTest: true,
  setupGuide: [
    "**Step 1: Create or select a service**",
    "In PagerDuty, go to **Services** > **Service Directory** and select or create a service.",
    "",
    "**Step 2: Add an integration**",
    "In the service, go to **Integrations** > **Add Integration** > select **Events API v2**.",
    "",
    "**Step 3: Copy the routing key**",
    "Copy the **Integration Key** (routing key) shown after saving.",
  ].join("\n"),
  configFields: [
    {
      key: "routingKey",
      label: "Routing Key",
      type: "password",
      required: true,
      helpText: "Integration key from your PagerDuty service (Services > Service > Integrations > Events API v2)",
      placeholder: "e93facc04764012d7bfb002500d5d1a6",
    },
    {
      key: "severity",
      label: "Default Severity",
      type: "select",
      required: true,
      helpText: "Severity level for created incidents",
      options: [
        { label: "Critical", value: "critical" },
        { label: "Error", value: "error" },
        { label: "Warning", value: "warning" },
        { label: "Info", value: "info" },
      ],
    },
  ],
};
