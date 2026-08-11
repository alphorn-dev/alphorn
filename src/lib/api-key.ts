import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";

// Number of leading characters of a key kept in plaintext (Webhook.apiKeyPrefix)
// for UI identification. "alp_" + 8 hex chars.
const API_KEY_PREFIX_LENGTH = 12;

export function generateApiKey(): string {
  return `alp_${randomBytes(32).toString("hex")}`;
}

// SHA-256 hex digest stored at rest (Webhook.apiKeyHash). Keys are high-entropy
// random tokens, so a plain hash (no salt/KDF) is sufficient to keep a DB dump
// from yielding usable credentials while staying cheap on the receiver hot path.
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX_LENGTH);
}

export function generatePublicId(): string {
  return nanoid(21);
}

export function generateWebhookId(): string {
  return `wh_${nanoid(16)}`;
}

export function generateChannelId(): string {
  return `ch_${nanoid(16)}`;
}
