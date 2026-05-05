import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const TRACE_HEADER = "x-alphorn-trace";

export function getMaxHops(): number {
  const raw = process.env.WEBHOOK_MAX_HOPS;
  if (!raw) return 3;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required for webhook loop signing",
    );
  }
  const ikm = Buffer.from(secret, "utf8");
  const info = Buffer.from("alphorn.webhook-loop.v1", "utf8");
  cachedKey = Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), info, 32));
  return cachedKey;
}

// Test-only: reset cached key when BETTER_AUTH_SECRET changes between tests.
export function __resetKeyCacheForTests(): void {
  cachedKey = null;
}

function hmac(payload: string): string {
  return createHmac("sha256", getKey()).update(payload).digest("base64url");
}

export function signTrace(trace: string[]): string {
  const payload = Buffer.from(JSON.stringify(trace), "utf8").toString("base64url");
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

export function verifyTrace(token: string | null | undefined): string[] | null {
  if (!token) return null;
  const idx = token.indexOf(".");
  if (idx <= 0 || idx === token.length - 1) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (sig.includes(".")) return null;

  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || !decoded.every((s) => typeof s === "string")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
