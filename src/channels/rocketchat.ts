import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { webhookUrlConfigSchema } from "./utils";
import { truncate } from "./truncate";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./rocketchat.meta";

// Rocket.Chat mirrors Mattermost's 16383-char message text limit.
const ROCKETCHAT_TEXT_MAX = 16383;

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
        text: truncate(
          notification.title
            ? `**${notification.title}**\n${notification.message}`
            : notification.message,
          ROCKETCHAT_TEXT_MAX,
        ),
      }),
    });
    await throwIfNotOk(res, "Rocket.Chat");
  },
});
