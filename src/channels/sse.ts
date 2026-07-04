import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { publish } from "@/lib/sse/connection-registry";
import { formatSseEvent, type SseConfig } from "@/lib/sse/format";
import { meta } from "./sse.meta";

const configSchema = z.object({
  format: z.enum(["json", "text"]).default("json"),
  includePriority: z.boolean().default(true),
  includeTags: z.boolean().default(true),
  includePayload: z.boolean().default(true),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const sseConfig: SseConfig = {
      format: config.format,
      includePriority: config.includePriority,
      includeTags: config.includeTags,
      includePayload: config.includePayload,
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
  // No test: a live stream only means something to a client already
  // connected via EventSource/curl, so a "send a test" button isn't useful.
  test: undefined,
});
