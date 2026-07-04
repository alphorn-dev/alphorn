import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "telegram",
  displayName: "Telegram",
  description: "Send notifications via Telegram bot",
  icon: "telegram",
  hasTest: true,
  setupGuide: [
    "**Step 1: Create a bot**",
    "Open Telegram, search for **@BotFather**, and send `/newbot`. Follow the prompts to name your bot. Copy the **bot token** it gives you.",
    "",
    "**Step 2: Get your Chat ID**",
    "Decide where you want notifications: your personal chat, or a group.",
    "",
    "**Personal chat:** Open a conversation with your new bot (search for it by username) and send it any message (e.g. \"hello\"). Then open this URL in your browser:",
    "`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`",
    "Replace `<YOUR_BOT_TOKEN>` with the full token from Step 1 (the whole string including the colon, e.g. `123456:ABC-DEF...`). Look for `\"chat\":{\"id\":123456789}` in the response — that number is your Chat ID.",
    "",
    "**Group chat:** Add the bot to a group, send any message in the group, then open the same URL above. The Chat ID for groups is a negative number like `-1001234567890`.",
    "",
    "**Important:** You must send a message to the bot (or in the group) **before** testing. Bots cannot initiate conversations — they can only reply to chats where a user has already sent a message.",
  ].join("\n"),
  configFields: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      required: true,
      helpText: "From @BotFather — looks like 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    },
    {
      key: "chatId",
      label: "Chat ID",
      type: "text",
      required: true,
      helpText: "Your personal or group chat ID (a number). See setup guide above for how to find it.",
      placeholder: "123456789",
    },
  ],
};
