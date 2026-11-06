import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { hashApiKey } from "@/lib/api-key";
import { logger as rootLogger } from "@/lib/logger";
import { ingestWebhook } from "@/lib/ingest";
import { getCachedWebhook } from "@/lib/webhook-cache";
import { TRACE_HEADER, verifyTrace, getMaxHops } from "@/lib/webhook-loop/hops";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params;
  const logger = rootLogger.child({ component: "webhook", publicId });

  const webhook = await getCachedWebhook(publicId);

  if (!webhook) {
    logger.info("Webhook not found");
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 }
    );
  }

  if (webhook.requireAuth) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logger.info({ webhookId: webhook.id }, "Auth failed: missing or invalid authorization header");
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }
    const apiKey = authHeader.slice(7);
    // Compare SHA-256 digests: both are fixed 32-byte buffers, so no length
    // pre-check is needed (and timingSafeEqual would throw on a size mismatch).
    const presented = Buffer.from(hashApiKey(apiKey), "hex");
    const expected = Buffer.from(webhook.apiKeyHash, "hex");
    if (!timingSafeEqual(presented, expected)) {
      logger.info({ webhookId: webhook.id }, "Auth failed: invalid API key");
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }
  }

  if (!webhook.enabled) {
    logger.info({ webhookId: webhook.id }, "Webhook is disabled");
    return NextResponse.json(
      { error: "Webhook is disabled" },
      { status: 403 }
    );
  }

  const verifiedTrace = verifyTrace(req.headers.get(TRACE_HEADER)) ?? [];

  if (verifiedTrace.length >= getMaxHops()) {
    logger.warn(
      { webhookId: webhook.id, traceLength: verifiedTrace.length },
      "Webhook loop detected (hop limit reached)",
    );
    return NextResponse.json({ error: "Loop detected" }, { status: 508 });
  }

  if (verifiedTrace.includes(webhook.publicId)) {
    logger.warn(
      { webhookId: webhook.id, traceLength: verifiedTrace.length },
      "Webhook loop detected (publicId already in trace)",
    );
    return NextResponse.json({ error: "Loop detected" }, { status: 508 });
  }

  return ingestWebhook({
    webhook,
    req,
    logger,
    trace: [...verifiedTrace, webhook.publicId],
  });
}
