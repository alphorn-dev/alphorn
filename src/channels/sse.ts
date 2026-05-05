import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { publish } from "@/lib/sse/connection-registry";
import { formatSseEvent, type SseConfig } from "@/lib/sse/format";

const configSchema = z.object({
  format: z.enum(["json", "text"]).default("json"),
  includePriority: z.boolean().default(true),
  includeTags: z.boolean().default(true),
  includePayload: z.boolean().default(true),
});

registerChannel({
  type: "sse",
  displayName: "Live Stream (SSE)",
  description: "Stream notifications in real-time via Server-Sent Events",
  icon: "sse",
  configSchema,
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
  async send(config, notification, context) {
    const parsed = configSchema.parse(config);
    const sseConfig: SseConfig = {
      format: parsed.format,
      includePriority: parsed.includePriority,
      includeTags: parsed.includeTags,
      includePayload: parsed.includePayload,
    };

    if (process.env.SSE_MODE === "standalone" && process.env.SSE_SERVER_URL) {
      // Standalone mode: POST to external SSE server
      const url = `${process.env.SSE_SERVER_URL}/publish/${context.channelId}`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SSE_INTERNAL_SECRET}`,
        },
        body: JSON.stringify({ notification, config: sseConfig }),
      });
      await throwIfNotOk(res, "SSE server");
    } else {
      // Embedded mode: write directly to connected clients
      const event = formatSseEvent(notification, sseConfig);
      publish(context.channelId, event);
    }
  },
});
