import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { hashApiKey } from "@/lib/api-key";
import { evaluateFilter } from "@/lib/filter";
import type { FilterDefinition } from "@/lib/filter/schema";
import { logger as rootLogger } from "@/lib/logger";
import { isSlackPayload, normalizeSlackPayload } from "@/lib/slack-compat";
import { extractFromPayload, extractFromText } from "@/lib/webhook-extract";
import { checkMessageQuotaForSubscription } from "@/lib/billing/subscription";
import { persistMessageAndEnqueueDeliveries } from "@/lib/delivery";
import { getCachedWebhook } from "@/lib/webhook-cache";
import {
  getWebhookBodyLimit,
  PayloadTooLargeError,
  readBodyWithLimit,
} from "@/lib/http/body-limit";
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

  // Enforce quota before parsing the body so an over-quota caller can't force
  // us to buffer and parse megabytes of payload we're going to reject anyway.
  const quota = await checkMessageQuotaForSubscription(
    webhook.organizationId,
    webhook.subscription,
  );
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "Message quota exceeded",
        limit: quota.limit,
        usage: quota.usage,
        plan: quota.plan,
      },
      { status: 429 },
    );
  }

  // Rejections of caller input below log at info: logger.warn is forwarded to
  // Sentry, and anyone holding a publicId could otherwise burn the quota.
  const bodyLimit = getWebhookBodyLimit();
  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, bodyLimit);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      logger.info(
        { webhookId: webhook.id, limit: err.limit },
        "Payload too large",
      );
      return NextResponse.json(
        { error: "Payload too large", limit: err.limit },
        { status: 413 },
      );
    }
    throw err;
  }

  // Postgres rejects U+0000 in text and jsonb (both the raw byte and the JSON
  // escape "\\u0000"), which would 500 after the quota was consumed. Strip
  // both forms up front so every derived value (title, message, payload) is
  // safe to persist. This also strips the 6-char text "\\u0000" from an
  // escaped backslash sequence, which is practically never legitimate content.
  rawBody = rawBody.replace(/\u0000|\\u0000/g, "");

  const contentType = req.headers.get("content-type") || "";
  let title: string | null;
  let messageText: string;
  let priority: number | null;
  let tags: string[];
  let payload: Record<string, unknown> | null;
  // Reuse the raw request text for the jsonb insert instead of re-serializing
  // the parsed object. Only safe when payload is exactly JSON.parse(rawBody)
  // (a plain object) — set alongside payload in the JSON branch only.
  let payloadJson: string | undefined;

  // Any "json" content type (incl. application/*+json) is parsed as JSON, and
  // so is an undeclared body that looks like an object: `curl -d '{...}'`
  // sends application/x-www-form-urlencoded. Only a declared JSON body is
  // rejected when it does not parse; anything else falls back to plain text.
  const declaredJson = contentType.includes("json");
  let body: Record<string, unknown> | null = null;
  if (declaredJson || /^\s*\{/.test(rawBody)) {
    let parsed: unknown;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      if (declaredJson) {
        logger.info({ webhookId: webhook.id, contentType }, "Invalid JSON body");
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 }
        );
      }
    }
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    } else if (declaredJson) {
      logger.info(
        { webhookId: webhook.id, contentType },
        "JSON body must be an object",
      );
      return NextResponse.json(
        { error: "JSON body must be an object" },
        { status: 400 },
      );
    }
  }

  if (body) {

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const extracted = extractFromPayload({
      body,
      headers,
      templates: {
        titleTemplate: webhook.titleTemplate,
        messageTemplate: webhook.messageTemplate,
        tagsTemplate: webhook.tagsTemplate,
        priorityTemplate: webhook.priorityTemplate,
      },
      fallback: isSlackPayload(body) ? normalizeSlackPayload(body) : undefined,
    });
    title = extracted.title;
    messageText = extracted.message;
    priority = extracted.priority;
    tags = extracted.tags;
    payload = body;
    payloadJson = rawBody;
  } else {
    const extracted = extractFromText(rawBody, req.headers);
    title = extracted.title;
    messageText = extracted.message;
    priority = extracted.priority;
    tags = extracted.tags;
    payload = null;
  }

  const filterMessage = { title, message: messageText, priority, tags, payload };

  const enabledChannels = webhook.channels.filter(
    (wc) =>
      wc.enabled &&
      wc.channel.enabled &&
      evaluateFilter(filterMessage, wc.filter as FilterDefinition | null)
  );

  const { messageId } = await persistMessageAndEnqueueDeliveries({
    webhookId: webhook.id,
    title,
    message: messageText,
    priority,
    tags,
    payload,
    payloadJson,
    channelIds: enabledChannels.map((wc) => wc.channelId),
    trace: [...verifiedTrace, webhook.publicId],
  });

  logger.info(
    { messageId, deliveryCount: enabledChannels.length },
    "Webhook processed",
  );

  return NextResponse.json({ messageId }, { status: 201 });
}
