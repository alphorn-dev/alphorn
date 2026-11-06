import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Sanitizes a user-supplied redirect target (e.g. ?redirect= query param) to
// prevent open redirects: only same-origin paths ("/...") are allowed, and
// "//..." / "/\..." variants (protocol-relative URLs) are rejected. Control
// characters and backslashes are rejected anywhere: URL parsing drops tabs and
// newlines, so "/\t/evil.com" would otherwise resolve to "//evil.com".
export function sanitizeRedirect(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || /[\x00-\x1f\x7f\\]/.test(value)) return "/";
  return value;
}
