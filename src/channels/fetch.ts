// 15s is long enough for slow-but-alive webhook targets and short enough that
// a hung endpoint doesn't tie up a worker slot until pg-boss' 5min expiry.
export const CHANNEL_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number = CHANNEL_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
