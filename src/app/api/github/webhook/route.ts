import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { githubAppConfig, verifyGithubSignature } from "@/lib/github/app";
import { ingestWebhook } from "@/lib/ingest";
import { logger as rootLogger } from "@/lib/logger";
import { getCachedWebhook } from "@/lib/webhook-cache";
import {
  getWebhookBodyLimit,
  PayloadTooLargeError,
  readBodyWithLimit,
} from "@/lib/http/body-limit";

const logger = rootLogger.child({ component: "github-webhook" });

const envelopeSchema = z.object({
  action: z.string().optional(),
  installation: z.object({ id: z.number().int().positive() }).optional(),
});

const ignored = (reason: string) => NextResponse.json({ ignored: reason }, { status: 202 });

// The full payload is stored and shown to every project member. Never store a leaked
// secret's value, should a secret scanning payload carry one (alert.secret).
function withoutSecretValue(rawBody: string): string {
  const body = JSON.parse(rawBody) as { alert?: Record<string, unknown> };
  if (body.alert && "secret" in body.alert) delete body.alert.secret;
  return JSON.stringify(body);
}

/** Receives every event of every installation of the GitHub App and routes it by installation id. */
export async function POST(req: Request) {
  const config = githubAppConfig();
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, getWebhookBodyLimit());
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      logger.info({ limit: err.limit }, "Payload too large");
      return NextResponse.json({ error: "Payload too large", limit: err.limit }, { status: 413 });
    }
    throw err;
  }

  if (!verifyGithubSignature(rawBody, req.headers.get("x-hub-signature-256"), config.webhookSecret)) {
    logger.info("Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let envelope: z.infer<typeof envelopeSchema>;
  try {
    envelope = envelopeSchema.parse(JSON.parse(rawBody));
  } catch {
    logger.info("Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = req.headers.get("x-github-event") ?? "";
  // `ping` (sent when the App is created) carries no installation.
  if (!envelope.installation) return ignored("no installation");
  const installationId = BigInt(envelope.installation.id);
  const log = logger.child({ installationId: installationId.toString(), event });

  if (event === "installation") {
    if (envelope.action === "deleted") {
      const link = await prisma.githubInstallation.findUnique({ where: { installationId } });
      if (link) {
        // Soft-delete keeps the webhook's message history, like deleting it in the UI.
        await prisma.$transaction([
          prisma.githubInstallation.delete({ where: { id: link.id } }),
          prisma.webhook.update({
            where: { id: link.webhookId },
            data: { deletedAt: new Date(), enabled: false },
          }),
        ]);
        log.info({ webhookId: link.webhookId }, "GitHub App uninstalled, webhook removed");
      }
    } else if (envelope.action === "suspend" || envelope.action === "unsuspend") {
      await prisma.githubInstallation.updateMany({
        where: { installationId },
        data: { suspendedAt: envelope.action === "suspend" ? new Date() : null },
      });
    }
    return ignored("installation lifecycle");
  }

  // ponytail: one indexed lookup per event; cache it alongside webhook-cache if GitHub traffic gets hot.
  const link = await prisma.githubInstallation.findUnique({
    where: { installationId },
    select: { events: true, suspendedAt: true, webhook: { select: { publicId: true } } },
  });
  if (!link) return ignored("unknown installation");
  if (link.suspendedAt) return ignored("installation suspended");
  // Dropped before ingestWebhook, so unselected events never count against the quota.
  if (!link.events.includes(event)) return ignored("event not selected");

  const webhook = await getCachedWebhook(link.webhook.publicId);
  if (!webhook || !webhook.enabled) return ignored("webhook disabled");

  return ingestWebhook({
    webhook,
    req,
    logger: log.child({ webhookId: webhook.id }),
    trace: [webhook.publicId],
    rawBody: event.startsWith("secret_scanning") ? withoutSecretValue(rawBody) : rawBody,
  });
}
