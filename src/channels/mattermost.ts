import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { webhookUrlConfigSchema } from "./utils";
import { truncate } from "./truncate";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./mattermost.meta";

// Mattermost limits incoming-webhook message text to 16383 chars.
const MATTERMOST_TEXT_MAX = 16383;

const configSchema = webhookUrlConfigSchema();

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const { webhookUrl } = config;
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...traceHeaders(context.trace) },
      body: JSON.stringify({
        username: "Alphorn",
        text: truncate(
          notification.title
            ? `**${notification.title}**\n${notification.message}`
            : notification.message,
          MATTERMOST_TEXT_MAX,
        ),
      }),
    });
    await throwIfNotOk(res, "Mattermost webhook");
  },
});
