import { createHmac, timingSafeEqual } from "crypto";

export { DEFAULT_GITHUB_EVENTS, GITHUB_EVENT_IDS, GITHUB_EVENTS } from "./events";

/**
 * GitHub App integration ("Connect GitHub"). Enabled only when all four env
 * vars are set; hosted and self-hosted share this code, each with its own App.
 * No private key is needed: Alphorn never calls the API as the App, it only
 * receives signed webhooks and checks installation access with a user token.
 */
export interface GithubAppConfig {
  slug: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
}

export function githubAppConfig(): GithubAppConfig | null {
  const slug = process.env.GITHUB_APP_SLUG;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!slug || !clientId || !clientSecret || !webhookSecret) return null;
  return { slug, clientId, clientSecret, webhookSecret };
}

/** Verifies `X-Hub-Signature-256: sha256=<hex>` over the raw request body. */
export function verifyGithubSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const presented = Buffer.from(header.slice(7), "hex");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export function installUrl(config: GithubAppConfig): string {
  return `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`;
}

export function authorizeUrl(config: GithubAppConfig, state: string, redirectUri: string): string {
  const params = new URLSearchParams({ client_id: config.clientId, state, redirect_uri: redirectUri });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/** Exchanges an OAuth code for a user access token, or null if GitHub rejects it. */
export async function exchangeCode(config: GithubAppConfig, code: string): Promise<string | null> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed with HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: unknown };
  return typeof data.access_token === "string" ? data.access_token : null;
}

async function githubGet(token: string, path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function githubJson<T>(token: string, path: string): Promise<T> {
  const res = await githubGet(token, path);
  if (!res.ok) throw new Error(`GitHub API ${path.split("?")[0]} failed with HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface UserInstallation {
  id: number;
  account: { id: number; login: string; type: string } | null;
}

// ponytail: 10 pages of 100 installations; a user with more visible installations of this App can't connect.
const MAX_INSTALLATION_PAGES = 10;

export type InstallationAuthority =
  | { ok: true; login: string }
  | { ok: false; reason: "access" | "org-admin" };

/**
 * Whether the token's user may connect the whole installation. The
 * installation_id GitHub appends to the setup URL is a plain, spoofable query
 * param, so it is never trusted without this check. Seeing the installation is
 * not enough: any collaborator with read access to one of its repositories
 * sees it, and linking would route events of every repository in it. So a
 * user-account installation must belong to this user, and an organization
 * installation needs an active organization owner (role admin).
 */
export async function checkInstallationAuthority(
  token: string,
  installationId: bigint,
): Promise<InstallationAuthority> {
  let installation: UserInstallation | undefined;
  for (let page = 1; page <= MAX_INSTALLATION_PAGES && !installation; page++) {
    const data = await githubJson<{ installations: UserInstallation[] }>(
      token,
      `/user/installations?per_page=100&page=${page}`,
    );
    installation = data.installations.find((i) => BigInt(i.id) === installationId);
    if (data.installations.length < 100) break;
  }
  const account = installation?.account;
  if (!account) return { ok: false, reason: "access" };

  if (account.type === "User") {
    const user = await githubJson<{ id: number }>(token, "/user");
    return user.id === account.id ? { ok: true, login: account.login } : { ok: false, reason: "access" };
  }

  // Enterprise and other account types can't be checked here: reject them.
  if (account.type !== "Organization") return { ok: false, reason: "access" };

  const res = await githubGet(token, `/user/memberships/orgs/${encodeURIComponent(account.login)}`);
  if (res.status === 403 || res.status === 404) return { ok: false, reason: "org-admin" };
  if (!res.ok) throw new Error(`GitHub org membership check failed with HTTP ${res.status}`);
  const membership = (await res.json()) as { role?: string; state?: string };
  return membership.state === "active" && membership.role === "admin"
    ? { ok: true, login: account.login }
    : { ok: false, reason: "org-admin" };
}
