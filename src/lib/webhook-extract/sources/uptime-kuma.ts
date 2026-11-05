// Uptime Kuma "Webhook" notification: { heartbeat, monitor, msg }. The test
// notification sends heartbeat and monitor as null.
// Source: https://github.com/louislam/uptime-kuma/blob/master/server/notification-providers/webhook.js

import {
  str,
  num,
  lines,
  tags,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

// Heartbeat status codes from Uptime Kuma's src/util.ts.
const STATES: Record<number, { word: string; tag: string; priority: number | null }> = {
  0: { word: "DOWN", tag: "down", priority: 4 },
  1: { word: "UP", tag: "up", priority: 2 },
  2: { word: "PENDING", tag: "pending", priority: null },
  3: { word: "IN MAINTENANCE", tag: "maintenance", priority: null },
};

function uptimeKuma(body: Body): AutoResult {
  const msg = str(body, "msg");
  const monitorName = str(body, "monitor.name");
  const monitorType = str(body, "monitor.type");

  // Test notification: no monitor or heartbeat attached.
  if (body.monitor === null && body.heartbeat === null) {
    return {
      title: "Uptime Kuma test notification",
      message: msg,
      priority: null,
      tags: tags("uptime-kuma", "test"),
    };
  }

  const state = STATES[num(body, "heartbeat.status") ?? -1];
  const name = monitorName || "Monitor";
  const lastDown = str(body, "heartbeat.lastDownTime");
  return {
    title: state ? `${name} is ${state.word}` : `${name}: status update`,
    message: lines(
      msg,
      str(body, "monitor.url") || str(body, "monitor.hostname"),
      str(body, "heartbeat.time") && `Time: ${str(body, "heartbeat.time")} UTC`,
      lastDown && `Down since: ${lastDown} UTC`
    ),
    priority: state?.priority ?? null,
    tags: tags("uptime-kuma", state?.tag ?? "", monitorType.toLowerCase(), monitorName.toLowerCase()),
  };
}

export const uptimeKumaSource: AutoSource = {
  id: "uptime-kuma",
  // Key presence, not values: the test notification sends heartbeat and monitor as null.
  detect: (body) => "heartbeat" in body && "monitor" in body && "msg" in body,
  extract: (body) => uptimeKuma(body),
};
