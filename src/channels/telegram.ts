import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { escapeHtml } from "./utils";
import { truncate } from "./truncate";
import { meta } from "./telegram.meta";

const TELEGRAM_MAX_LENGTH = 4096;

const TELEGRAM_TITLE_MAX_LENGTH = 256;

function buildText(title: string | null, message: string): string {
  const header = title
    ? `<b>${escapeHtml(truncate(title, TELEGRAM_TITLE_MAX_LENGTH))}</b>\n`
    : "";
  const body = escapeHtml(message);
  const full = header + body;
  if (full.length <= TELEGRAM_MAX_LENGTH) return full;
  // Drop an entity the cut split in half: Telegram rejects a dangling "&am".
  return header + truncate(body, TELEGRAM_MAX_LENGTH - header.length).replace(/&[a-z]*…$/, "…");
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
