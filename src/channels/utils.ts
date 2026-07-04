import { z } from "zod";

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

/** Shared config schema for channels that take a single webhook URL. */
export function webhookUrlConfigSchema() {
  return z.object({
    webhookUrl: z.string().url("Must be a valid URL"),
  });
}
