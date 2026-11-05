import { filterHeaders } from "@/lib/webhook-extract";
import { TRACE_HEADER } from "@/lib/webhook-loop/hops";

// Headers describing the hop to Alphorn rather than the event: the HTTP client
// recomputes them, or they would leak proxy/client details to the target.
const HOP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "expect",
  "accept-encoding",
  "forwarded",
  "via",
  "x-real-ip",
  "true-client-ip",
  TRACE_HEADER,
]);
const HOP_PREFIXES = ["x-forwarded-", "cf-", "x-amzn-"];

// Shared secrets and signatures (X-Gitlab-Token, X-Hub-Signature-256,
// Stripe-Signature, ...). Signatures would not verify anyway: the payload is
// re-serialized from jsonb.
const SECRET_PATTERN = /token|secret|signature|password/;

/**
 * Request headers the Forward channel replays to its target, e.g.
 * X-GitHub-Event or Content-Type. Credentials, signatures and hop/infra
 * headers are dropped. Keys are lowercase.
 */
export function pickForwardHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filterHeaders(headers))) {
    const lower = key.toLowerCase();
    if (HOP_HEADERS.has(lower)) continue;
    if (HOP_PREFIXES.some((p) => lower.startsWith(p))) continue;
    if (SECRET_PATTERN.test(lower)) continue;
    out[lower] = value;
  }
  return out;
}
