import { z } from "zod";
import { compareHosts } from "@/lib/webhook-loop/same-host";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Basic auth header value for `user:pass` credentials. */
export function basicAuthHeader(user: string, pass: string): string {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

/** Joins a base URL (trailing slash optional) with a path (leading slash optional). */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export const SAME_HOST_ERROR =
  "Webhook channels can't point at this Alphorn instance. Use a channel directly on your webhook instead.";

export function getAppUrl(): string {
  const u = process.env.BETTER_AUTH_URL;
  if (!u) throw new Error("BETTER_AUTH_URL is required");
  return u;
}

/** True when `url` resolves to this Alphorn instance — used to block webhook loops. */
export function isSameHostAsApp(url: string): boolean {
  return compareHosts(url, getAppUrl());
}

/**
 * Adds the same-host loop guard to a URL string schema so no channel can be
 * pointed back at this Alphorn instance's own receiver.
 */
export function refineNotAppHost(schema: z.ZodString) {
  return schema.refine((url) => !isSameHostAsApp(url), { message: SAME_HOST_ERROR });
}

/** Shared config schema for channels that take a single webhook URL. */
export function webhookUrlConfigSchema() {
  return z.object({
    webhookUrl: refineNotAppHost(z.string().url("Must be a valid URL")),
  });
}
