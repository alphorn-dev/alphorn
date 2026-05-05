import * as Sentry from "@sentry/nextjs";
import { APP_VERSION } from "@/lib/version";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: parseFloat(
        process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"
      ),
      environment: process.env.SENTRY_ENVIRONMENT || "production",
      release: APP_VERSION,
      enableLogs: true,
    });
  }

  const { register: registerNode } = await import("./instrumentation.node");
  await registerNode();
}

export const onRequestError = Sentry.captureRequestError;
