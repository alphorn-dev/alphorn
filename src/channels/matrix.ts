import { z } from "zod";
import { registerChannel } from "./registry";
import { fetchWithTimeout } from "./fetch";
import { throwIfNotOk } from "./errors";
import { escapeHtml, joinUrl, refineNotAppHost } from "./utils";
import { truncate } from "./truncate";
import { traceHeaders } from "@/lib/webhook-loop/hops";
import { meta } from "./matrix.meta";

// Matrix events must stay under the 65536-byte federation cap; 32768 chars is
// a generous ceiling that leaves room for the HTML formatted_body.
const MATRIX_BODY_MAX = 32768;

const configSchema = z.object({
  homeserverUrl: refineNotAppHost(z.string().url("Must be a valid URL")),
  accessToken: z.string().min(1, "Access token is required"),
  roomId: z.string().min(1, "Room ID is required"),
});

registerChannel({
  ...meta,
  configSchema,
  async send(config, notification, context) {
    const { homeserverUrl, accessToken, roomId } = config;
    const txnId = crypto.randomUUID();
    const url = joinUrl(homeserverUrl, `_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`);
    const res = await fetchWithTimeout(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...traceHeaders(context.trace),
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: truncate(
          notification.title
            ? `${notification.title}\n${notification.message}`
            : notification.message,
          MATRIX_BODY_MAX,
        ),
        format: "org.matrix.custom.html",
        formatted_body: notification.title
          ? `<b>${escapeHtml(notification.title)}</b><br>${escapeHtml(notification.message)}`
          : escapeHtml(notification.message),
      }),
    });
    await throwIfNotOk(res, "Matrix API");
  },
});
