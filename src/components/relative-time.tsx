import { formatDateTime, formatRelativeTime } from "@/lib/format-date";

/** "5 minutes ago", with the absolute date and time on hover. */
export function RelativeTime({ date }: { date: Date | string }) {
  const d = new Date(date);
  return (
    // Server and client render at different instants; the minute-granular
    // text can legitimately differ between them.
    <time dateTime={d.toISOString()} title={formatDateTime(d)} suppressHydrationWarning>
      {formatRelativeTime(d)}
    </time>
  );
}
