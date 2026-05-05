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
  const body = await res.text();
  const msg = `${label} error ${res.status}: ${body}`;
  if (res.status !== 429 && res.status >= 400 && res.status < 500) {
    throw new PermanentChannelError(msg);
  }
  throw new Error(msg);
}
