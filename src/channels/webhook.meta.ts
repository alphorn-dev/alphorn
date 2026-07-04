import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "webhook",
  displayName: "Webhook",
  description: "Send notifications to any HTTP endpoint",
  icon: "webhook",
  hasTest: true,
  configFields: [
    {
      key: "url",
      label: "Endpoint URL",
      type: "text",
      required: true,
      helpText:
        "The URL that will receive POST/PUT requests. It cannot point at this Alphorn instance — to deliver to a webhook here, attach channels directly to that webhook.",
      placeholder: "https://api.example.com/notifications",
    },
    {
      key: "method",
      label: "HTTP Method",
      type: "select",
      required: true,
      options: [
        { label: "POST", value: "POST" },
        { label: "PUT", value: "PUT" },
      ],
    },
    {
      key: "headers",
      label: "Custom Headers",
      type: "keyvalue",
      helpText: "Additional HTTP headers to send with the request (e.g. Authorization)",
    },
  ],
};
