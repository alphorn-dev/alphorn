import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "forward",
  displayName: "Forward",
  description: "Relay the original webhook request unchanged to another endpoint",
  icon: "forward",
  hasTest: true,
  configFields: [
    {
      key: "url",
      label: "Endpoint URL",
      type: "text",
      required: true,
      helpText:
        "Receives the original body and event headers (e.g. X-GitHub-Event), not the Alphorn notification format. Credentials and signature headers are not forwarded. It cannot point at this Alphorn instance.",
      placeholder: "https://ci.example.com/hooks/github",
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
      helpText: "Added to the forwarded headers and override them (e.g. Authorization for the target)",
    },
  ],
};
