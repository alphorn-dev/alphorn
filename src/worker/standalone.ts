import * as Sentry from "@sentry/node";
import { logger } from "@/lib/logger";
import { configureEgressProxy } from "@/lib/http/egress";
import { APP_VERSION } from "@/lib/version";
import { startWorker } from "./index";
import { stopQueue } from "@/lib/queue";
import { startSecretEncryption } from "@/lib/crypto/encrypt-existing";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    release: APP_VERSION,
  });
}

process.on("uncaughtException", (err) => {
  logger.fatal({ err, error: err.message }, "Uncaught exception in worker");
});
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err, error: err.message }, "Unhandled promise rejection in worker");
});

configureEgressProxy();
startSecretEncryption();
logger.info({ component: "worker", mode: "standalone" }, "Starting Alphorn worker");
await startWorker();

async function shutdown() {
  // Finish in-flight deliveries; a hard exit leaves them PROCESSING until the
  // 10 min sweep re-sends them (possibly a duplicate).
  await stopQueue().catch((err) => logger.error({ err }, "Worker shutdown failed"));
  await Sentry.flush(2000).catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
