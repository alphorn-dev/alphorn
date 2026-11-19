import { randomBytes, timingSafeEqual } from "crypto";
import { nanoid } from "nanoid";
import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminOrOwner } from "@/lib/auth/server";
import {
  apiKeyPrefix,
  generateApiKey,
  generatePublicId,
  generateWebhookId,
  hashApiKey,
} from "@/lib/api-key";
import {
  authorizeUrl,
  DEFAULT_GITHUB_EVENTS,
  exchangeCode,
  githubAppConfig,
  checkInstallationAuthority,
  installUrl,
  listAdministeredInstallations,
} from "@/lib/github/app";
import { logger as rootLogger } from "@/lib/logger";
import { assertWebhookLimit } from "@/lib/webhook-limit";

const logger = rootLogger.child({ component: "github-connect" });
const COOKIE = "alphorn_github_connect";
const CALLBACK_PATH = "/api/github/callback";

interface ConnectState {
  nonce: string;
  /** Set when GitHub sent us here after an installation; null for "start". */
  installationId: string | null;
  orgId: string;
}

function baseUrl(): string {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

function redirectTo(path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, baseUrl()));
  res.cookies.delete({ name: COOKIE, path: CALLBACK_PATH });
  return res;
}

const fail = (code: string) => redirectTo(`/webhooks?github_error=${code}`);

function readState(req: NextRequest): ConnectState | null {
  const raw = req.cookies.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConnectState>;
    if (
      typeof parsed.nonce === "string" &&
      (typeof parsed.installationId === "string" || parsed.installationId === null) &&
      typeof parsed.orgId === "string"
    ) {
      return parsed as ConnectState;
    }
  } catch {
    // fall through
  }
  return null;
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Two-step connect flow, both steps on this URL (set it as the App's Setup URL
 * and Callback URL):
 *
 * 1. Either `?start=1` (the Connect button) or `installation_id` (GitHub after
 *    an installation, or the picker). The id is spoofable, so we only remember
 *    it (cookie bound to the project and a nonce) and send the user through OAuth.
 * 2. OAuth returns `code` + `state`. We check the nonce and exchange the code.
 *    With an installation id we ask GitHub whether this user owns it (see
 *    checkInstallationAuthority) and only then link it. Without one (start),
 *    we send the user to the picker with the installations they may connect,
 *    or straight to installing the App if there are none. Picking one comes
 *    back here with its installation_id, so the check above always runs.
 */
export async function GET(req: NextRequest) {
  const config = githubAppConfig();
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let orgId: string;
  try {
    ({ orgId } = await requireAdminOrOwner());
  } catch (err) {
    unstable_rethrow(err);
    return fail("permission");
  }

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const stateParam = params.get("state");

  if (code && stateParam) {
    const state = readState(req);
    if (!state || !sameString(state.nonce, stateParam) || state.orgId !== orgId) {
      logger.info({ orgId }, "GitHub connect state mismatch");
      return fail("state");
    }
    const token = await exchangeCode(config, code);
    if (!token) return fail("oauth");

    if (state.installationId === null) {
      const installations = await listAdministeredInstallations(token);
      if (installations.length === 0) return redirectTo(installUrl(config));
      // Ids and logins are only for display: picking one re-runs the verified flow.
      const picker = new URLSearchParams(installations.map((i) => ["i", `${i.id}:${i.login}`]));
      return redirectTo(`/webhooks/github?${picker}`);
    }

    const installationId = BigInt(state.installationId);
    const owner = await checkInstallationAuthority(token, installationId);
    if (!owner.ok) {
      logger.info(
        { orgId, installationId: state.installationId, reason: owner.reason },
        "GitHub connect rejected: user lacks authority over installation",
      );
      return fail(owner.reason);
    }

    try {
      await assertWebhookLimit(orgId);
    } catch {
      return fail("limit");
    }

    const webhookId = generateWebhookId();
    const unusedKey = generateApiKey();
    try {
      await prisma.$transaction([
        prisma.webhook.create({
          data: {
            id: webhookId,
            name: `GitHub (${owner.login})`,
            // Events come in through /api/github/webhook. The /n/ endpoint
            // stays locked behind a key nobody knows, so it can't be used to
            // inject fake GitHub events into this webhook.
            apiKeyHash: hashApiKey(unusedKey),
            apiKeyPrefix: apiKeyPrefix(unusedKey),
            publicId: generatePublicId(),
            requireAuth: true,
            extractMode: "auto",
            organizationId: orgId,
          },
        }),
        prisma.githubInstallation.create({
          data: {
            id: `ghi_${nanoid(16)}`,
            installationId,
            events: DEFAULT_GITHUB_EVENTS,
            webhookId,
            organizationId: orgId,
          },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Already linked to this project (connected twice, e.g. in two tabs).
        const existing = await prisma.githubInstallation.findUniqueOrThrow({
          where: { installationId_organizationId: { installationId, organizationId: orgId } },
        });
        return redirectTo(`/webhooks/${existing.webhookId}`);
      }
      throw err;
    }

    logger.info({ orgId, webhookId, installationId: state.installationId }, "GitHub App connected");
    return redirectTo(`/webhooks/${webhookId}?github=connected`);
  }

  const installationParam = params.get("installation_id");
  if (installationParam !== null) {
    if (!/^\d{1,19}$/.test(installationParam)) return fail("install");
    // Already linked to this project (e.g. "Redirect on update" after changing repos).
    const existing = await prisma.githubInstallation.findUnique({
      where: {
        installationId_organizationId: { installationId: BigInt(installationParam), organizationId: orgId },
      },
      select: { webhookId: true },
    });
    if (existing) return redirectTo(`/webhooks/${existing.webhookId}`);
  } else if (params.get("start") !== "1") {
    return fail("install");
  }

  const nonce = randomBytes(32).toString("base64url");
  const res = NextResponse.redirect(
    authorizeUrl(config, nonce, new URL(CALLBACK_PATH, baseUrl()).toString()),
  );
  const state: ConnectState = { nonce, installationId: installationParam, orgId };
  res.cookies.set(COOKIE, JSON.stringify(state), {
    httpOnly: true,
    // Lax so the cookie survives the top-level redirect back from github.com.
    sameSite: "lax",
    secure: baseUrl().startsWith("https://"),
    path: CALLBACK_PATH,
    maxAge: 600,
  });
  return res;
}
