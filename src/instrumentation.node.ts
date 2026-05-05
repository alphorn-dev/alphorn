export async function register() {
  const { configureEgressProxy } = await import("./lib/http/egress");
  configureEgressProxy();

  // Only start the embedded worker in "all" mode (default).
  // MODE=web skips it; MODE=worker uses the standalone worker entry point.
  const mode = process.env.MODE ?? "all";
  if (mode !== "all") return;

  const { startWorker } = await import("./worker");
  await startWorker();
}
