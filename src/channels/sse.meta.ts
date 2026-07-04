import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "sse",
  displayName: "Live Stream (SSE)",
  description: "Stream notifications in real-time via Server-Sent Events",
  icon: "sse",
  hasTest: false,
  setupGuide: [
    "**How it works**",
    "This channel streams notifications in real-time using Server-Sent Events (SSE). Any client that supports SSE can connect — browsers, `curl`, scripts, etc.",
    "",
    "**After creating this channel:**",
    "1. Link it to a webhook (just like any other channel)",
    "2. Copy the **Stream URL** shown on the channel edit page",
    "3. Connect with `EventSource` in a browser or `curl -N <url>`",
    "",
    "**Configuration**",
    "Choose **JSON** for structured data or **Plain Text** for a human-readable line. The toggle fields below apply to both formats.",
  ].join("\n"),
  configFields: [
    {
      key: "format",
      label: "Output Format",
      type: "select",
      required: true,
      default: "json",
      helpText: "JSON sends structured data, Text sends a human-readable line",
      options: [
        { label: "JSON", value: "json" },
        { label: "Plain Text", value: "text" },
      ],
    },
    {
      key: "includePriority",
      label: "Include Priority",
      type: "switch",
      helpText: "Include the priority field in streamed events",
    },
    {
      key: "includeTags",
      label: "Include Tags",
      type: "switch",
      helpText: "Include the tags field in streamed events",
    },
    {
      key: "includePayload",
      label: "Include Payload",
      type: "switch",
      helpText: "Include the full payload in streamed events",
    },
  ],
};
