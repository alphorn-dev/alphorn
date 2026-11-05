import type { Notification } from "@/channels/types";

export interface SseConfig {
  format: "json" | "text";
  includePriority: boolean;
  includeTags: boolean;
  includePayload: boolean;
}

export function formatSseEvent(
  notification: Notification,
  config: SseConfig
): string {
  if (config.format === "text") {
    // Format: timestamp | priority | title | message | tags | payload
    // Only include fields the user has toggled on (title & message always)
    const parts: string[] = [];
    parts.push(new Date().toISOString());
    if (config.includePriority && notification.priority != null) {
      parts.push(String(notification.priority));
    }
    if (notification.title) parts.push(notification.title);
    parts.push(notification.message);
    if (config.includeTags && notification.tags?.length) {
      parts.push(notification.tags.join(", "));
    }
    if (config.includePayload && notification.payload) {
      const keysToOmit = new Set(["title", "message", "priority", "tags"]);
      const extra = Object.fromEntries(
        Object.entries(notification.payload).filter(([k]) => !keysToOmit.has(k))
      );
      if (Object.keys(extra).length > 0) {
        parts.push(JSON.stringify(extra));
      }
    }
    // Every line needs its own "data:" prefix, or a newline in the text starts a new SSE field
    // (event:, id:, retry:) or event. Clients rejoin the lines with "\n".
    const lines = parts.join(" | ").split(/\r\n|\r|\n/);
    return `${lines.map((l) => `data: ${l}`).join("\n")}\n\n`;
  }

  const data: Record<string, unknown> = {
    ...(notification.title ? { title: notification.title } : {}),
    message: notification.message,
    timestamp: new Date().toISOString(),
  };

  if (config.includePriority && notification.priority != null) {
    data.priority = notification.priority;
  }
  if (config.includeTags && notification.tags?.length) {
    data.tags = notification.tags;
  }
  if (config.includePayload && notification.payload) {
    data.payload = notification.payload;
  }

  return `data: ${JSON.stringify(data)}\n\n`;
}

export function formatSseComment(text: string): string {
  return `: ${text}\n\n`;
}
