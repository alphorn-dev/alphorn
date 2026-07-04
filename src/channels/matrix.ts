import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { escapeHtml, joinUrl } from "./utils";
import { meta } from "./matrix.meta";

const configSchema = z.object({
  homeserverUrl: z.string().url("Must be a valid URL"),
  accessToken: z.string().min(1, "Access token is required"),
  roomId: z.string().min(1, "Room ID is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification) {
    const { homeserverUrl, accessToken, roomId } = config;
    const txnId = crypto.randomUUID();
    const url = joinUrl(homeserverUrl, `_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`);
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
});
