import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { PermanentChannelError } from "./errors";

const TELEGRAM_MAX_LENGTH = 4096;
const TRUNCATION_SUFFIX = "\n…[truncated]";

function buildText(title: string | null, message: string): string {
  const header = title ? `<b>${escapeHtml(title)}</b>\n` : "";
  const body = escapeHtml(message);
  const full = header + body;
  if (full.length <= TELEGRAM_MAX_LENGTH) return full;
  const room = TELEGRAM_MAX_LENGTH - header.length - TRUNCATION_SUFFIX.length;
  return header + body.slice(0, Math.max(0, room)) + TRUNCATION_SUFFIX;
}

async function handleTelegramResponse(res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.text();
  const msg = `Telegram API error ${res.status}: ${body}`;
  // 429 = rate limited (transient). 5xx = server error (transient).
  // Any other 4xx (400, 401, 403, 404) = permanent — retrying will not help.
  if (res.status !== 429 && res.status >= 400 && res.status < 500) {
    throw new PermanentChannelError(msg);
  }
  throw new Error(msg);
}

const configSchema = z.object({
  botToken: z.string().min(1, "Bot token is required"),
  chatId: z.string().min(1, "Chat ID is required"),
});

registerChannel({
  type: "telegram",
  displayName: "Telegram",
  description: "Send notifications via Telegram bot",
  icon: "telegram",
  setupGuide: [
    "1. Open Telegram and message **@BotFather**",
    "2. Send `/newbot` and follow the prompts to create a bot",
    "3. Copy the bot token provided by BotFather",
    "4. Add the bot to your chat or group",
    "5. Send a message in the chat, then get your Chat ID from **@userinfobot** or the Telegram API",
  ].join("\n"),
  configSchema,
  configFields: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      required: true,
      helpText: "The token you received from @BotFather",
      placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    },
    {
      key: "chatId",
      label: "Chat ID",
      type: "text",
      required: true,
      helpText:
        "Your chat or group ID. Message @userinfobot to find your personal chat ID",
      placeholder: "-1001234567890",
    },
  ],
  async send(config, notification) {
    const { botToken, chatId } = configSchema.parse(config);
    const text = buildText(notification.title, notification.message);
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );
    await handleTelegramResponse(res);
  },
  async test(config) {
    const { botToken, chatId } = configSchema.parse(config);
    const text = "<b>Alphorn Test</b>\nThis is a test message from Alphorn. If you see this, your Telegram channel is configured correctly.";
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      }
    );
    await handleTelegramResponse(res);
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
