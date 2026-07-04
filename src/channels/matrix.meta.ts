import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "matrix",
  displayName: "Matrix",
  description: "Send notifications to a Matrix room (Element, etc.)",
  icon: "matrix",
  hasTest: true,
  setupGuide: [
    "**Highly recommended: create a dedicated user**",
    "The access token grants full access to the account that issued it — including reading all messages and joining or leaving rooms. Create a separate Matrix user for Alphorn and invite it to the room, rather than using your personal account's token.",
    "",
    "**Step 1: Get your access token**",
    "Sign in as the dedicated user in Element, then go to **Settings** > **Help & About** > scroll to **Access Token** and copy it.",
    "",
    "**Step 2: Get the Room ID**",
    "In Element: open the room > **Room Settings** > **Advanced** > copy the **Internal Room ID** (starts with `!`).",
    "",
    "**Step 3: Homeserver URL**",
    "This is your Matrix server URL, e.g. `https://matrix.org` for the default server. If self-hosting, use your server's URL.",
  ].join("\n"),
  configFields: [
    {
      key: "homeserverUrl",
      label: "Homeserver URL",
      type: "text",
      required: true,
      helpText: "Your Matrix homeserver URL (e.g. https://matrix.org)",
      placeholder: "https://matrix.org",
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      required: true,
      helpText: "From Element: Settings > Help & About > Access Token",
    },
    {
      key: "roomId",
      label: "Room ID",
      type: "text",
      required: true,
      helpText: "From Element: Room Settings > Advanced > Internal Room ID",
      placeholder: "!abc123:matrix.org",
    },
  ],
};
