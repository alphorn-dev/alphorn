export class PermanentChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentChannelError";
  }
}

export function isPermanentChannelError(
  err: unknown
): err is PermanentChannelError {
  return err instanceof PermanentChannelError;
}

/**
 * Throws a standardized Error if the response is not ok. 4xx (other than 429)
 * is treated as permanent so pg-boss short-circuits retries on bad auth, bad
 * URLs, and malformed payloads. 429 and 5xx stay transient and get retried.
 */
export async function throwIfNotOk(
  res: Response,
  label: string
): Promise<void> {
  if (res.ok) return;
  // Capped: the message lands in Delivery.lastError, the UI, Sentry and
  // failure notifications, and some APIs echo the whole request back.
  const body = (await res.text()).slice(0, 500);
  const msg = `${label} error ${res.status}: ${body}`;
  const err =
    res.status !== 429 && res.status >= 400 && res.status < 500
      ? new PermanentChannelError(msg)
      : new Error(msg);
  throw Object.assign(err, { status: res.status });
}

/**
 * Log fields for a delivery error without its message. Provider responses and SMTP replies
 * can echo recipients or the notification itself, and logs go to Sentry (AGENTS.md: no PII or
 * message bodies in logs). The full text stays in Delivery.lastError, shown to the project.
 */
export function errorLogFields(err: unknown): Record<string, unknown> {
  const e = (err ?? {}) as { name?: unknown; code?: unknown; responseCode?: unknown; status?: unknown };
  return {
    errorName: err instanceof Error ? err.name : typeof err,
    ...(e.status !== undefined && { status: e.status }),
    ...(e.code !== undefined && { code: e.code }),
    ...(e.responseCode !== undefined && { responseCode: e.responseCode }),
  };
}

/**
 * Whether a delivery error came from the target (HTTP status, network/SMTP
 * error code, timeout) rather than from our own code. Those are the project's
 * problem, shown in the UI and the failure notification, and must not become
 * Sentry events: one revoked Slack webhook would otherwise file hundreds.
 */
export function isExternalDeliveryError(err: unknown): boolean {
  if (isPermanentChannelError(err)) return true;
  const e = (err ?? {}) as {
    name?: unknown;
    status?: unknown;
    code?: unknown;
    responseCode?: unknown;
    cause?: { code?: unknown };
  };
  return (
    e.status !== undefined ||
    e.code !== undefined ||
    e.responseCode !== undefined ||
    e.cause?.code !== undefined || // undici "fetch failed" (ECONNREFUSED, ENOTFOUND, ...)
    e.name === "AbortError" ||
    e.name === "TimeoutError"
  );
}
