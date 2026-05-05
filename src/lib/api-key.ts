import { randomBytes } from "crypto";
import { nanoid } from "nanoid";

export function generateApiKey(): string {
  return `alp_${randomBytes(32).toString("hex")}`;
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
