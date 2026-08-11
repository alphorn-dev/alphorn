import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Sanitizes a user-supplied redirect target (e.g. ?redirect= query param) to
// prevent open redirects: only same-origin paths ("/...") are allowed, and
// "//..." / "/\..." variants (protocol-relative URLs) are rejected.
export function sanitizeRedirect(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
