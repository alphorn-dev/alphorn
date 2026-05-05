import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";

const configSchema = z.object({
  homeserverUrl: z.string().url("Must be a valid URL"),
  accessToken: z.string().min(1, "Access token is required"),
  roomId: z.string().min(1, "Room ID is required"),
});

registerChannel({
  type: "matrix",
  displayName: "Matrix",
  description: "Send notifications to a Matrix room (Element, etc.)",
  icon: "matrix",
  configSchema,
  configFields: [
    {
      key: "homeserverUrl",
      label: "Homeserver URL",
      type: "text",
      required: true,
      helpText:
        "Your Matrix homeserver URL (e.g. https://matrix.org)",
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
      helpText:
        "From Element: Room Settings > Advanced > Internal Room ID",
      placeholder: "!abc123:matrix.org",
    },
  ],
  async send(config, notification) {
    const { homeserverUrl, accessToken, roomId } = configSchema.parse(config);
    const txnId = crypto.randomUUID();
    const url = `${homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;
    const res = await fetchWithTimeout(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: notification.title
          ? `${notification.title}\n${notification.message}`
          : notification.message,
        format: "org.matrix.custom.html",
        formatted_body: notification.title
          ? `<b>${escapeHtml(notification.title)}</b><br>${escapeHtml(notification.message)}`
          : escapeHtml(notification.message),
      }),
    });
    await throwIfNotOk(res, "Matrix API");
  },
  async test(config) {
    const { homeserverUrl, accessToken, roomId } = configSchema.parse(config);
    const txnId = crypto.randomUUID();
    const url = `${homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;
    const res = await fetchWithTimeout(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: "Alphorn Test\nThis is a test message from Alphorn. If you see this, your Matrix room is configured correctly.",
        format: "org.matrix.custom.html",
        formatted_body:
          "<b>Alphorn Test</b><br>This is a test message from Alphorn. If you see this, your Matrix room is configured correctly.",
      }),
    });
    await throwIfNotOk(res, "Matrix API");
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
