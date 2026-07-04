import { format } from "date-fns";

/** e.g. "Jan 5, 2026, 3:45 PM" — full date and time for detail views. */
export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy, h:mm a");
}

/** e.g. "Jan 5, 2026" — date only, for list/table rows. */
export function formatDate(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy");
}

/** e.g. "Jan 5" — short label for chart axes. */
export function formatShortDate(date: Date | string): string {
  return format(new Date(date), "MMM d");
}
