import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { webhookUrlConfigSchema } from "./utils";
import { truncate } from "./truncate";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./slack.meta";

// Slack Block Kit limits: header block text 150 chars, section text 3000 chars.
const SLACK_HEADER_MAX = 150;
const SLACK_SECTION_MAX = 3000;

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
        blocks: [
          ...(notification.title
            ? [
                {
                  type: "header",
                  text: { type: "plain_text", text: truncate(notification.title, SLACK_HEADER_MAX) },
                },
              ]
            : []),
          {
            type: "section",
            text: { type: "mrkdwn", text: truncate(notification.message, SLACK_SECTION_MAX) },
          },
        ],
      }),
    });
    await throwIfNotOk(res, "Slack webhook");
  },
});
