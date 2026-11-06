import { BlockList, isIP } from "net";

function trustedProxies(): BlockList | null {
  const entries = process.env.TRUSTED_PROXIES?.split(",").map((e) => e.trim()).filter(Boolean);
  if (!entries?.length) return null;
  const list = new BlockList();
  for (const entry of entries) {
    const [addr, prefix] = entry.split("/");
    const type = isIP(addr) === 6 ? "ipv6" : "ipv4";
    if (!isIP(addr)) continue;
    if (prefix) list.addSubnet(addr, Number(prefix), type);
    else list.addAddress(addr, type);
  }
  return list;
}

/**
 * Client IP for per-IP limits. X-Forwarded-For is read from the right: the left-most entries
 * are whatever the client sent. Proxies listed in TRUSTED_PROXIES (same setting as the auth
 * rate limit) are skipped; without it the right-most entry is used, which is the client as
 * seen by the nearest proxy (or the only value if the proxy overwrites the header).
 */
export function clientIp(
  forwardedFor: string | null | undefined,
  realIp: string | null | undefined,
  socketIp?: string | null,
): string {
  const chain = (forwardedFor ?? "").split(",").map((ip) => ip.trim()).filter(Boolean);
  const trusted = trustedProxies();
  for (let i = chain.length - 1; i >= 0; i--) {
    const ip = chain[i];
    const version = isIP(ip);
    if (trusted && version && trusted.check(ip, version === 6 ? "ipv6" : "ipv4")) continue;
    return ip;
  }
  return realIp || socketIp || "unknown";
}
