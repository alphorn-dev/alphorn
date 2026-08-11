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

/** e.g. "Jan 5" — chart tick/tooltip label for a "yyyy-MM-dd" day string, parsed as local time. */
export function formatChartDate(label: unknown): string {
  return formatShortDate(`${String(label)}T00:00:00`);
}

/** e.g. "850ms" / "1.3s" — delivery latency for metrics displays. */
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
