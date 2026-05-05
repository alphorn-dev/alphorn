import * as Sentry from "@sentry/nextjs";
import { APP_VERSION } from "@/lib/version";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: parseFloat(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"
    ),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
    release: APP_VERSION,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
