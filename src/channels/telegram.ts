import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { meta } from "./telegram.meta";

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

const configSchema = z.object({
  botToken: z.string().min(1, "Bot token is required"),
  chatId: z.string().min(1, "Chat ID is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { botToken, chatId } = config;
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
    await throwIfNotOk(res, "Telegram API");
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
