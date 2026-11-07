import * as Sentry from "@sentry/nextjs";
import { APP_VERSION } from "@/lib/version";

function init(dsn: string, environment: string, tracesSampleRate: number) {
  Sentry.init({ dsn, environment, tracesSampleRate, release: APP_VERSION });
}

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  init(
    process.env.NEXT_PUBLIC_SENTRY_DSN,
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
    parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
  );
} else {
  // Prebuilt image: DSN only known at runtime. ponytail: errors before the
  // fetch resolves are missed; inline the config into the HTML if that matters.
  fetch("/api/sentry-config")
    .then((res) => (res.ok ? res.json() : null))
    .then((cfg: { dsn: string | null; environment: string; tracesSampleRate: number } | null) => {
      if (cfg?.dsn) init(cfg.dsn, cfg.environment, cfg.tracesSampleRate);
    })
    .catch(() => {});
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
