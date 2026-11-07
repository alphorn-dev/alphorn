import { connection, NextResponse } from "next/server";

/**
 * Browser Sentry config, read at request time. The build only inlines
 * NEXT_PUBLIC_SENTRY_DSN when SENTRY_DSN is set at build, which the published
 * image never has; this lets SENTRY_DSN at runtime enable client errors too.
 * A browser DSN is public by design.
 */
export async function GET() {
  await connection();
  return NextResponse.json(
    {
      dsn: process.env.SENTRY_DSN || null,
      environment: process.env.SENTRY_ENVIRONMENT || "production",
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
