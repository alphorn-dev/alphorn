import { createHmac } from "crypto";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const SECRET = "gh_test_webhook_secret";
process.env.GITHUB_APP_SLUG = "alphorn-test";
process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
process.env.GITHUB_APP_CLIENT_SECRET = "test_client_secret";
process.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
process.env.BETTER_AUTH_URL = "https://app.test";

const auth = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminOrOwner: async () => ({ orgId: auth.orgId }),
}));

import { GET as callback } from "@/app/api/github/callback/route";
import { POST as githubWebhook } from "@/app/api/github/webhook/route";

const COOKIE = "alphorn_github_connect";

// GitHub API stub at the HTTP boundary: token exchange, the user's visible
// installations, the user, and their org membership.
type Account = { id: number; login: string; type: "User" | "Organization" };
const ME = { id: 1, login: "hans", type: "User" } as const;

function stubGithub({
  token = "gho_test",
  account = ME as Account,
  visible = true,
  orgRole = "admin",
}: { token?: string | null; account?: Account; visible?: boolean; orgRole?: string } = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.href === "https://github.com/login/oauth/access_token") {
      return Response.json(token ? { access_token: token } : { error: "bad_verification_code" });
    }
    if (url.pathname === "/user/installations") {
      const installations = visible ? [{ id: Number(currentInstallation), account }] : [];
      return Response.json({ total_count: installations.length, installations });
    }
    if (url.pathname === "/user") return Response.json({ id: ME.id, login: ME.login });
    if (url.pathname === `/user/memberships/orgs/${account.login}`) {
      return Response.json({ state: "active", role: orgRole });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
let currentInstallation = "4711";

async function newOrg() {
  const id = `org_${nanoid(10)}`;
  await prisma.organization.create({ data: { id, name: "GitHub test org" } });
  return id;
}

/** Runs step 1 (setup redirect) and returns the state cookie + nonce for step 2. */
async function startConnect(installationId: string) {
  currentInstallation = installationId;
  const res = await callback(
    new NextRequest(`https://app.test/api/github/callback?installation_id=${installationId}&setup_action=install`),
  );
  expect(res.status).toBe(307);
  const location = new URL(res.headers.get("location")!);
  expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
  return { cookie: res.cookies.get(COOKIE)!.value, nonce: location.searchParams.get("state")! };
}

function finishConnect(cookie: string | null, state: string) {
  return callback(
    new NextRequest(`https://app.test/api/github/callback?code=abc&state=${encodeURIComponent(state)}`, {
      headers: cookie ? { cookie: `${COOKIE}=${encodeURIComponent(cookie)}` } : {},
    }),
  );
}

function errorCode(res: Response) {
  return new URL(res.headers.get("location")!).searchParams.get("github_error");
}

function deliver(event: string, body: object, signature?: string) {
  const raw = JSON.stringify(body);
  return githubWebhook(
    new Request("https://app.test/api/github/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": event,
        "x-hub-signature-256":
          signature ?? `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`,
      },
      body: raw,
    }),
  );
}

const prOpened = (installationId: number) => ({
  action: "opened",
  installation: { id: installationId },
  repository: { full_name: "hans/repo", name: "repo" },
  sender: { login: "hans" },
  pull_request: { number: 1, title: "Add feature", html_url: "https://github.com/hans/repo/pull/1" },
});

beforeEach(async () => {
  auth.orgId = await newOrg();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub connect callback", () => {
  it("links the installation after the user's access is verified", async () => {
    const fetchMock = stubGithub();
    const { cookie, nonce } = await startConnect("4711");
    const res = await finishConnect(cookie, nonce);

    expect(res.headers.get("location")).toMatch(/^https:\/\/app\.test\/webhooks\/wh_.+\?github=connected$/);
    const link = await prisma.githubInstallation.findUniqueOrThrow({
      where: { installationId: BigInt(4711) },
      include: { webhook: true },
    });
    expect(link.organizationId).toBe(auth.orgId);
    expect(link.webhook.name).toBe("GitHub (hans)");
    expect(link.webhook.requireAuth).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user/installations?per_page=100&page=1",
      expect.anything(),
    );
  });

  it("rejects an installation the user cannot see (spoofed installation_id)", async () => {
    stubGithub({ visible: false });
    const { cookie, nonce } = await startConnect("4711");
    expect(errorCode(await finishConnect(cookie, nonce))).toBe("access");
    expect(await prisma.githubInstallation.count()).toBe(0);
  });

  it("rejects another user's account installation the user only collaborates on", async () => {
    stubGithub({ account: { id: 2, login: "someone-else", type: "User" } });
    const { cookie, nonce } = await startConnect("4711");
    expect(errorCode(await finishConnect(cookie, nonce))).toBe("access");
    expect(await prisma.githubInstallation.count()).toBe(0);
  });

  it("links an organization installation only for an organization owner", async () => {
    const org = { id: 50, login: "acme", type: "Organization" } as const;
    stubGithub({ account: org, orgRole: "member" });
    const member = await startConnect("4711");
    expect(errorCode(await finishConnect(member.cookie, member.nonce))).toBe("org-admin");
    expect(await prisma.githubInstallation.count()).toBe(0);

    stubGithub({ account: org, orgRole: "admin" });
    const owner = await startConnect("4711");
    const res = await finishConnect(owner.cookie, owner.nonce);
    expect(res.headers.get("location")).toContain("?github=connected");
    const link = await prisma.githubInstallation.findUniqueOrThrow({
      where: { installationId: BigInt(4711) },
      include: { webhook: true },
    });
    expect(link.webhook.name).toBe("GitHub (acme)");
  });

  it("rejects a wrong state, a missing cookie and a project switch mid-flow", async () => {
    stubGithub();
    const { cookie, nonce } = await startConnect("4711");

    expect(errorCode(await finishConnect(cookie, "forged"))).toBe("state");
    expect(errorCode(await finishConnect(null, nonce))).toBe("state");
    auth.orgId = await newOrg();
    expect(errorCode(await finishConnect(cookie, nonce))).toBe("state");
    expect(await prisma.githubInstallation.count()).toBe(0);
  });

  it("refuses an installation already linked to another project", async () => {
    stubGithub();
    const first = await startConnect("4711");
    await finishConnect(first.cookie, first.nonce);

    auth.orgId = await newOrg();
    const second = await startConnect("4711");
    const res = await finishConnect(second.cookie, second.nonce);

    expect(errorCode(res)).toBe("linked");
    expect(await prisma.githubInstallation.count()).toBe(1);
    expect(await prisma.webhook.count({ where: { organizationId: auth.orgId } })).toBe(0);
  });

  it("rejects a malformed installation_id", async () => {
    const res = await callback(new NextRequest("https://app.test/api/github/callback?installation_id=1;drop"));
    expect(errorCode(res)).toBe("install");
  });
});

describe("GitHub webhook endpoint", () => {
  async function connected(installationId: number) {
    stubGithub();
    const { cookie, nonce } = await startConnect(String(installationId));
    await finishConnect(cookie, nonce);
    vi.unstubAllGlobals();
    return prisma.githubInstallation.findUniqueOrThrow({ where: { installationId: BigInt(installationId) } });
  }

  it("routes a selected event to the linked project's webhook", async () => {
    const link = await connected(100);
    const res = await deliver("pull_request", prOpened(100));

    expect(res.status).toBe(201);
    const message = await prisma.message.findFirstOrThrow({ where: { webhookId: link.webhookId } });
    expect(message.title).toContain("[hans/repo]");
    expect(message.tags).toEqual(expect.arrayContaining(["github", "pull_request"]));
  });

  it("drops unselected events without creating a message", async () => {
    const link = await connected(101);
    const res = await deliver("push", { ...prOpened(101), ref: "refs/heads/main" });

    expect(res.status).toBe(202);
    expect(await prisma.message.count({ where: { webhookId: link.webhookId } })).toBe(0);
  });

  it("rejects an invalid signature", async () => {
    await connected(102);
    const res = await deliver("pull_request", prOpened(102), "sha256=" + "0".repeat(64));
    expect(res.status).toBe(401);
    expect(await prisma.message.count()).toBe(0);
  });

  it("ignores events of unknown installations", async () => {
    const res = await deliver("pull_request", prOpened(999));
    expect(res.status).toBe(202);
    expect(await prisma.message.count()).toBe(0);
  });

  it("stops delivering while suspended and removes the webhook on uninstall", async () => {
    const link = await connected(103);

    await deliver("installation", { action: "suspend", installation: { id: 103 } });
    expect((await deliver("pull_request", prOpened(103))).status).toBe(202);
    await deliver("installation", { action: "unsuspend", installation: { id: 103 } });
    expect((await deliver("pull_request", prOpened(103))).status).toBe(201);

    await deliver("installation", { action: "deleted", installation: { id: 103 } });
    expect(await prisma.githubInstallation.count()).toBe(0);
    const webhook = await prisma.webhook.findUniqueOrThrow({ where: { id: link.webhookId } });
    expect(webhook.deletedAt).not.toBeNull();
  });
});
