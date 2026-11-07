export async function register() {
  const { configureEgressProxy } = await import("./lib/http/egress");
  configureEgressProxy();

  // Only start the embedded worker in "all" mode (default).
  // MODE=web skips it; MODE=worker uses the standalone worker entry point.
  const mode = process.env.MODE ?? "all";
  if (mode !== "all") return;

  const { startWorker } = await import("./worker");
  await startWorker();

  // Next's own SIGTERM handler exits without waiting for the embedded worker.
  // docker-entrypoint.sh sets NEXT_MANUAL_SIG_HANDLE for MODE=all so this
  // handler owns shutdown. ponytail: without it (e.g. bare `next start`) the
  // worker still dies mid-job and the sweep recovers after 10 min.
  if (process.env.NEXT_MANUAL_SIG_HANDLE) {
    const { stopQueue } = await import("./lib/queue");
    const { logger } = await import("./lib/logger");
    const shutdown = (code: number) => async () => {
      await stopQueue().catch((err) => logger.error({ err }, "Worker shutdown failed"));
      process.exit(code);
    };
    process.once("SIGTERM", shutdown(143));
    process.once("SIGINT", shutdown(130));
  }
}
