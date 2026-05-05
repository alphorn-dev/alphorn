const DEFAULT_WEBHOOK_LIMIT = 1_048_576;

export class PayloadTooLargeError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`Payload exceeds ${limit} bytes`);
    this.limit = limit;
  }
}

export function getWebhookBodyLimit(): number {
  const raw = process.env.WEBHOOK_MAX_BODY_BYTES;
  if (!raw) return DEFAULT_WEBHOOK_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_WEBHOOK_LIMIT;
}

export async function readBodyWithLimit(
  req: Request,
  limitBytes: number,
): Promise<string> {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const claimed = Number(contentLength);
    if (Number.isFinite(claimed) && claimed > limitBytes) {
      throw new PayloadTooLargeError(limitBytes);
    }
  }

  const reader = req.body?.getReader();
  if (!reader) return "";

  let received = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limitBytes) {
        throw new PayloadTooLargeError(limitBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (chunks.length === 0) return "";
  if (chunks.length === 1) return new TextDecoder().decode(chunks[0]);

  const buf = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}
