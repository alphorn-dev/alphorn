import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
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
    logger.warn("Webhook not found");
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 }
    );
  }

  if (webhook.requireAuth) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logger.warn({ webhookId: webhook.id }, "Auth failed: missing or invalid authorization header");
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }
    const apiKey = authHeader.slice(7);
    const expected = webhook.apiKey;
    if (
      apiKey.length !== expected.length ||
      !timingSafeEqual(Buffer.from(apiKey), Buffer.from(expected))
    ) {
      logger.warn({ webhookId: webhook.id }, "Auth failed: invalid API key");
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }
  }

  if (!webhook.enabled) {
    logger.warn({ webhookId: webhook.id }, "Webhook is disabled");
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

  const bodyLimit = getWebhookBodyLimit();
  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, bodyLimit);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      logger.warn(
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

  const contentType = req.headers.get("content-type") || "";
  let title: string | null;
  let messageText: string;
  let priority: number | null;
  let tags: string[];
  let payload: Record<string, unknown> | null;

  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = rawBody ? JSON.parse(rawBody) : null;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        logger.warn(
          { webhookId: webhook.id, contentType },
          "JSON body must be an object",
        );
        return NextResponse.json(
          { error: "JSON body must be an object" },
          { status: 400 },
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      logger.warn({ webhookId: webhook.id, contentType }, "Invalid JSON body");
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

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
    channelIds: enabledChannels.map((wc) => wc.channelId),
    trace: [...verifiedTrace, webhook.publicId],
  });

  logger.info(
    { messageId, deliveryCount: enabledChannels.length },
    "Webhook processed",
  );

  return NextResponse.json({ messageId }, { status: 201 });
}
