import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { githubAppConfig, verifyGithubSignature } from "@/lib/github/app";
import { isRelevantGithubEvent } from "@/lib/github/events";
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
  deployment_status: z.object({ state: z.string() }).optional(),
});

const ignored = (reason: string) => NextResponse.json({ ignored: reason }, { status: 202 });

// The full payload is stored and shown to every project member. Never store a leaked
// secret's value, should a secret scanning payload carry one (alert.secret).
function withoutSecretValue(rawBody: string): string {
  const body = JSON.parse(rawBody) as { alert?: Record<string, unknown> };
  if (body.alert && "secret" in body.alert) delete body.alert.secret;
  return JSON.stringify(body);
}

/**
 * Receives every event of every installation of the GitHub App and routes it
 * by installation id to every project that linked it.
 */
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
      const links = await prisma.githubInstallation.findMany({ where: { installationId } });
      if (links.length > 0) {
        const webhookIds = links.map((l) => l.webhookId);
        // Soft-delete keeps the webhooks' message history, like deleting them in the UI.
        await prisma.$transaction([
          prisma.githubInstallation.deleteMany({ where: { installationId } }),
          prisma.webhook.updateMany({
            where: { id: { in: webhookIds } },
            data: { deletedAt: new Date(), enabled: false },
          }),
        ]);
        log.info({ webhookIds }, "GitHub App uninstalled, webhooks removed");
      }
    } else if (envelope.action === "suspend" || envelope.action === "unsuspend") {
      await prisma.githubInstallation.updateMany({
        where: { installationId },
        data: { suspendedAt: envelope.action === "suspend" ? new Date() : null },
      });
    }
    return ignored("installation lifecycle");
  }

  if (!isRelevantGithubEvent(event, envelope)) return ignored("action not relevant");

  // ponytail: one indexed lookup per event; cache it alongside webhook-cache if GitHub traffic gets hot.
  const links = await prisma.githubInstallation.findMany({
    where: { installationId, suspendedAt: null, events: { has: event } },
    select: { webhook: { select: { publicId: true } } },
  });
  // Unselected events are dropped before ingestWebhook, so they never count against the quota.
  if (links.length === 0) return ignored("no project selected this event");

  const body = event.startsWith("secret_scanning") ? withoutSecretValue(rawBody) : rawBody;
  let delivered = 0;
  // ponytail: sequential, one ingest per linked project; parallelize if installations get many projects.
  for (const link of links) {
    const webhook = await getCachedWebhook(link.webhook.publicId);
    if (!webhook || !webhook.enabled) continue;
    const webhookLog = log.child({ webhookId: webhook.id });
    const res = await ingestWebhook({ webhook, req, logger: webhookLog, trace: [webhook.publicId], rawBody: body });
    // One project's quota or rate limit must neither fail delivery for the others
    // nor make GitHub show the delivery as failed.
    if (res.ok) delivered++;
    else webhookLog.info({ status: res.status }, "GitHub event not ingested for project");
  }
  return delivered > 0 ? NextResponse.json({ delivered }, { status: 201 }) : ignored("not ingested");
}
