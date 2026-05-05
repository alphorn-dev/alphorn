type SseWriter = {
  write(chunk: string): void;
  close(): void;
};

const DEFAULT_PER_CHANNEL = 20;
const DEFAULT_PER_IP = 20;

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getPerChannelLimit(): number {
  return readPositiveInt(
    process.env.SSE_MAX_CONNECTIONS_PER_CHANNEL,
    DEFAULT_PER_CHANNEL,
  );
}

export function getPerIpLimit(): number {
  return readPositiveInt(
    process.env.SSE_MAX_CONNECTIONS_PER_IP,
    DEFAULT_PER_IP,
  );
}

const globalForSse = globalThis as unknown as {
  sseConnections?: Map<string, Map<SseWriter, string>>;
  sseIpCounts?: Map<string, number>;
};

if (!globalForSse.sseConnections) {
  globalForSse.sseConnections = new Map();
}
if (!globalForSse.sseIpCounts) {
  globalForSse.sseIpCounts = new Map();
}

const connections = globalForSse.sseConnections;
const ipCounts = globalForSse.sseIpCounts;

export type AddConnectionResult =
  | { ok: true }
  | { ok: false; reason: "channel_full" | "ip_full" };

export function addConnection(
  channelId: string,
  writer: SseWriter,
  ip: string,
): AddConnectionResult {
  const existing = connections.get(channelId);
  if (existing && existing.size >= getPerChannelLimit()) {
    return { ok: false, reason: "channel_full" };
  }
  if ((ipCounts.get(ip) ?? 0) >= getPerIpLimit()) {
    return { ok: false, reason: "ip_full" };
  }

  const map = existing ?? new Map<SseWriter, string>();
  map.set(writer, ip);
  if (!existing) connections.set(channelId, map);
  ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
  return { ok: true };
}

function decrementIp(ip: string): void {
  const count = ipCounts.get(ip) ?? 0;
  if (count <= 1) ipCounts.delete(ip);
  else ipCounts.set(ip, count - 1);
}

export function removeConnection(channelId: string, writer: SseWriter): void {
  const map = connections.get(channelId);
  if (!map) return;
  const ip = map.get(writer);
  if (ip === undefined) return;
  map.delete(writer);
  if (map.size === 0) connections.delete(channelId);
  decrementIp(ip);
}

export function publish(channelId: string, event: string): number {
  const map = connections.get(channelId);
  if (!map || map.size === 0) return 0;

  let sent = 0;
  for (const [writer, ip] of map) {
    try {
      writer.write(event);
      sent++;
    } catch {
      map.delete(writer);
      decrementIp(ip);
    }
  }

  if (map.size === 0) connections.delete(channelId);

  return sent;
}

export function getConnectionCount(channelId: string): number {
  return connections.get(channelId)?.size ?? 0;
}

export function getIpConnectionCount(ip: string): number {
  return ipCounts.get(ip) ?? 0;
}
