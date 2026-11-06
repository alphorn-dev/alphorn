import { NextResponse } from "next/server";
import { evaluateFilter } from "@/lib/filter";
import type { FilterDefinition } from "@/lib/filter/schema";
import type { logger as rootLogger } from "@/lib/logger";
import { isSlackPayload, normalizeSlackPayload } from "@/lib/slack-compat";
import { extractFromPayload, extractFromText } from "@/lib/webhook-extract";
import { pickForwardHeaders } from "@/lib/forward-headers";
import { checkMessageQuotaForSubscription } from "@/lib/billing/subscription";
import { persistMessageAndEnqueueDeliveries } from "@/lib/delivery";
import type { CachedWebhook } from "@/lib/webhook-cache";
import {
  getWebhookBodyLimit,
  PayloadTooLargeError,
  readBodyWithLimit,
} from "@/lib/http/body-limit";

/**
 * Shared receiver pipeline after the caller has authenticated the request:
 * quota, body parsing, extraction, filters, persist + enqueue. Used by the
 * public receiver (/n/[publicId]) and the GitHub App endpoint. `rawBody` is
 * passed when the caller already had to read it (e.g. for a signature check).
 */
export async function ingestWebhook({
  webhook,
  req,
  logger,
  trace,
  rawBody: preReadBody,
}: {
  webhook: CachedWebhook;
  req: Request;
  logger: typeof rootLogger;
  trace: string[];
  rawBody?: string;
}): Promise<NextResponse> {
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
  let rawBody: string;
  if (preReadBody !== undefined) {
    rawBody = preReadBody;
  } else {
    const bodyLimit = getWebhookBodyLimit();
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
  // (a plain object) - set alongside payload in the JSON branch only.
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

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  if (body) {
    const extracted = extractFromPayload({
      body,
      headers,
      mode: webhook.extractMode,
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
    headers: pickForwardHeaders(headers),
    channelIds: enabledChannels.map((wc) => wc.channelId),
    trace,
  });

  logger.info(
    { messageId, deliveryCount: enabledChannels.length },
    "Webhook processed",
  );

  return NextResponse.json({ messageId }, { status: 201 });
}
