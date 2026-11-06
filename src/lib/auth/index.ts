import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { passkey } from "@better-auth/passkey";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../db";
import { logger } from "../logger";
import { isMailerConfigured, sendMail } from "../email/mailer";
import { oidcProviderId, sessionSatisfies2FA } from "./two-factor-policy";
import { secondFactorAfter, secondFactorBefore } from "./second-factor-hooks";
import { PASSKEY_SIGN_IN_PATH, SSO_SIGN_IN_PATHS } from "./second-factor";
import { canCreateUser } from "./signup";
import { isBillingEnabled } from "../billing/paddle";
import { FREE_PROJECT_LIMIT } from "../billing/plans";
import { effectivePlan } from "../billing/subscription";
import { truncate } from "@/channels/truncate";
import { errorLogFields } from "@/channels/errors";
import {
  verificationEmailTemplate,
  invitationEmailTemplate,
  passwordResetEmailTemplate,
} from "../email/templates";

const mailerReady = isMailerConfigured();

const trustedProxies = process.env.TRUSTED_PROXIES?.split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// The .env.example placeholder is public: a secret left at it lets anyone
// forge what Better Auth and the webhook loop guard sign with it.
if (
  process.env.NODE_ENV === "production" &&
  process.env.BETTER_AUTH_SECRET === "change-me-to-a-random-string"
) {
  throw new Error("BETTER_AUTH_SECRET is still the .env.example placeholder. Generate one with: openssl rand -base64 32");
}

function requireBaseUrl(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) {
    throw new Error(
      "BETTER_AUTH_URL is required (used for verification, reset, and invitation links).",
    );
  }
  return url;
}

async function trySendMail(
  label: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  try {
    await sendMail(to, subject, html);
  } catch (err) {
    // Not err.message: SMTP rejections usually quote the recipient address.
    logger.error({ component: "mailer", label, ...errorLogFields(err) }, "Failed to send email");
    throw err;
  }
}

function assertStrongPassword(email: string, password: string): void {
  if (password.toLowerCase() === email.toLowerCase()) {
    throw new APIError("BAD_REQUEST", {
      message: "Password must not be the same as your email address.",
    });
  }
  const localPart = email.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    throw new APIError("BAD_REQUEST", {
      message: "Password must not contain your email address.",
    });
  }
}

// Organization endpoints a user may call for a project whose 2FA requirement
// they do not meet yet: they act on the user's own memberships, not on the
// project's data.
const ORG_PATHS_WITHOUT_2FA = new Set([
  "/organization/create",
  "/organization/list",
  "/organization/check-slug",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/get-invitation",
  "/organization/list-user-invitations",
  "/organization/leave",
]);

type OrgCtx = Parameters<typeof getSessionFromCtx>[0];

// Never matches a project (ids are nanoids): stands in for a slug that resolves to none.
const UNKNOWN_ORG = "~unknown-project~";

/**
 * Every project an organization API call could target. Better Auth's endpoints disagree on
 * precedence (set-active prefers the id, get-full-organization and list-members the slug) and
 * fall back to the active project only when neither is given (`||`, so "" counts as absent).
 * Gates check all candidates, so no precedence or empty-value trick reaches an unchecked one.
 */
async function targetOrgIds(
  ctx: OrgCtx,
  session: { session: Record<string, unknown> },
): Promise<string[]> {
  const body = ctx.body as { organizationId?: unknown; organizationSlug?: unknown } | undefined;
  const query = ctx.query as { organizationId?: unknown; organizationSlug?: unknown } | undefined;
  const str = (v: unknown) => (typeof v === "string" && v ? [v] : []);
  const ids = [...str(body?.organizationId), ...str(query?.organizationId)];
  for (const slug of [...str(body?.organizationSlug), ...str(query?.organizationSlug)]) {
    const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    ids.push(org?.id ?? UNKNOWN_ORG);
  }
  if (ids.length > 0) return [...new Set(ids)];
  const active = session.session.activeOrganizationId;
  return typeof active === "string" && active ? [active] : [];
}

// The member list and pending invitations hold the email address of everyone in a project.
// Better Auth hands them to any member; in Alphorn only owners and admins see them, as on the
// Members settings page. Members read their own role via get-active-member-role.
const ORG_ADMIN_READ_PATHS = new Set([
  "/organization/get-full-organization",
  "/organization/list-members",
  "/organization/list-invitations",
]);

async function assertOrgAdmin(ctx: OrgCtx): Promise<void> {
  const session = await getSessionFromCtx(ctx);
  if (!session) return; // the endpoint itself rejects unauthenticated calls
  for (const orgId of await targetOrgIds(ctx, session)) {
    const member = await prisma.member.findFirst({
      where: { organizationId: orgId, userId: session.user.id },
      select: { role: true },
    });
    const roles = member?.role.split(",").map((r) => r.trim()) ?? [];
    if (!roles.some((r) => r === "owner" || r === "admin")) {
      throw new APIError("FORBIDDEN", { message: "Only project owners and admins can see members" });
    }
  }
}

/**
 * Hosted: a user may own FREE_PROJECT_LIMIT projects on the free plan, or the free quota
 * multiplies with every new project. Every project is created through this endpoint.
 */
async function assertFreeProjectLimit(ctx: OrgCtx): Promise<void> {
  if (!isBillingEnabled()) return;
  const session = await getSessionFromCtx(ctx);
  if (!session) return;
  const owned = await prisma.member.findMany({
    where: { userId: session.user.id, role: "owner" },
    select: {
      organization: {
        select: { subscription: { select: { plan: true, status: true, currentPeriodEnd: true } } },
      },
    },
  });
  const free = owned.filter(
    (m) => !m.organization.subscription || effectivePlan(m.organization.subscription) === "free",
  ).length;
  if (free >= FREE_PROJECT_LIMIT) {
    throw new APIError("FORBIDDEN", {
      message: `The free plan includes up to ${FREE_PROJECT_LIMIT} projects. Upgrade or delete a project to create another one.`,
    });
  }
}

/**
 * Enforces the project's `requireTwoFactor` on Better Auth's organization API,
 * which clients can call directly and so bypasses the server-action gate in
 * requireSession().
 */
async function assertOrg2FA(ctx: OrgCtx): Promise<void> {
  const session = await getSessionFromCtx(ctx);
  if (!session) return; // the endpoint itself rejects unauthenticated calls

  const body = ctx.body as { organizationId?: string | null; organizationSlug?: string } | undefined;
  // set-active with organizationId: null clears the active project (resolveActiveOrgId() does
  // this for a locked one). Checked before targetOrgIds(), which treats null as "no id given"
  // and would test the active, locked project instead.
  if (
    ctx.path === "/organization/set-active" &&
    body?.organizationId === null &&
    !body.organizationSlug
  ) {
    return;
  }
  const orgIds = await targetOrgIds(ctx, session);
  const locked = await prisma.organizationSettings.count({
    where: { organizationId: { in: orgIds }, requireTwoFactor: true },
  });
  if (locked === 0) return;
  if (await sessionSatisfies2FA(session)) return;

  throw new APIError("FORBIDDEN", {
    message: "Two-factor authentication is required for this project",
  });
}

const betterAuthLogger = logger.child({ component: "better-auth" });

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  logger: {
    level: (process.env.BETTER_AUTH_LOG_LEVEL as "debug" | "info" | "warn" | "error" | undefined) ?? "warn",
    log: (level, message, ...args) => {
      const err = args.find((a) => a instanceof Error);
      const extra = args.find((a) => a && typeof a === "object" && !(a instanceof Error)) as
        | Record<string, unknown>
        | undefined;
      const bindings = { ...(extra ?? {}), ...(err ? { error: err } : {}) };
      const fn = level === "error" ? betterAuthLogger.error
        : level === "warn" ? betterAuthLogger.warn
        : level === "debug" ? betterAuthLogger.debug
        : betterAuthLogger.info;
      fn(bindings, message);
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    // The client sets X-Forwarded-For itself, so a single value is only the
    // real client IP when a proxy overwrites the header. With TRUSTED_PROXIES,
    // Better Auth walks the chain from the right and skips those proxies, so a
    // spoofed left-most entry can't mint fresh rate-limit buckets.
    ipAddress: trustedProxies
      ? { ipAddressHeaders: ["x-forwarded-for"], trustedProxies }
      : { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  emailAndPassword: {
    enabled: true,
    // A reset after a compromise must end the attacker's sessions too.
    revokeSessionsOnPasswordReset: true,
    requireEmailVerification: mailerReady,
    ...(mailerReady && {
      sendResetPassword: async ({ user, url }) => {
        await trySendMail(
          "password reset",
          user.email,
          "Reset your password - Alphorn",
          passwordResetEmailTemplate(url),
        );
      },
    }),
  },
  emailVerification: mailerReady
    ? {
        sendOnSignUp: true,
        sendOnSignIn: false,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
          await trySendMail(
            "verification",
            user.email,
            "Verify your email - Alphorn",
            verificationEmailTemplate(url),
          );
        },
      }
    : undefined,
  session: {
    additionalFields: {
      // When this session proved a passkey / authenticator app (./second-factor.ts). Server-set only.
      secondFactorAt: { type: "date", required: false, input: false },
      // When this session was created by an SSO sign-in (two-factor-policy.ts). Server-set only.
      ssoSignInAt: { type: "date", required: false, input: false },
      // Provider of that SSO sign-in; only the OIDC IdP counts for project 2FA. Server-set only.
      ssoProviderId: { type: "string", required: false, input: false },
    },
  },
  user: {
    changeEmail: mailerReady ? { enabled: true } : undefined,
  },
  // HTTP only (auth.api calls still work): email changes go through requestEmailChange() in
  // profile/actions.ts, which checks the current password first.
  disabledPaths: ["/change-email"],
  account: {
    accountLinking: {
      enabled: true,
      // Trusted providers link to an existing account by email even when the
      // provider marks the email unverified. Microsoft (tenant "common") lets
      // anyone set an arbitrary email in their own tenant, so it is not
      // trusted: it links only when Better Auth sees a verified email.
      trustedProviders: ["github", "google"],
    },
  },
  socialProviders: {
    ...(process.env.GITHUB_CLIENT_ID && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    }),
    ...(process.env.MICROSOFT_CLIENT_ID && {
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        tenantId: process.env.MICROSOFT_TENANT_ID || "common",
      },
    }),
  },
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  databaseHooks: {
    session: {
      create: {
        // Signing in with a passkey proves the second factor on its own; an SSO sign-in counts
        // as a recent sign-in, and through the OIDC IdP also for project 2FA requirements
        // (two-factor-policy.ts). Bound to this session, not the user.
        before: async (session, ctx) => {
          if (ctx?.path === PASSKEY_SIGN_IN_PATH) {
            return { data: { ...session, secondFactorAt: new Date() } };
          }
          if (ctx?.path && SSO_SIGN_IN_PATHS.includes(ctx.path)) {
            // /callback/:id carries the provider in the path, /sign-in/social in the body.
            const provider = (ctx.params?.id ?? ctx.body?.provider) as string | undefined;
            return {
              data: { ...session, ssoSignInAt: new Date(), ssoProviderId: provider ?? null },
            };
          }
        },
      },
    },
    user: {
      create: {
        // Every account-creating path (email sign-up, social, OIDC) lands here.
        before: async (user) => {
          if (!(await canCreateUser(user.email))) {
            throw new APIError("FORBIDDEN", {
              message: "Sign-ups are disabled. Ask an administrator for an invitation.",
            });
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Pending sessions, passkey names, wrong-code limit (./second-factor-hooks.ts).
      await secondFactorBefore(ctx);

      if (ctx.path === "/sign-up/email") {
        const email = ctx.body?.email as string | undefined;
        const password = ctx.body?.password as string | undefined;
        if (email && password) assertStrongPassword(email, password);
        return;
      }

      if (ctx.path === "/change-password") {
        const newPassword = ctx.body?.newPassword as string | undefined;
        const email = ctx.context.session?.user?.email as string | undefined;
        if (email && newPassword) assertStrongPassword(email, newPassword);
        return;
      }

      if (ctx.path === "/reset-password") {
        const newPassword = ctx.body?.newPassword as string | undefined;
        const token = (ctx.body?.token ?? ctx.query?.token) as string | undefined;
        if (!newPassword || !token) return;
        const verification = await ctx.context.internalAdapter.findVerificationValue(
          `reset-password:${token}`,
        );
        if (!verification) return;
        const user = await ctx.context.internalAdapter.findUserById(verification.value);
        if (user?.email) assertStrongPassword(user.email, newPassword);
        return;
      }

      if (ctx.path.startsWith("/organization/") && !ORG_PATHS_WITHOUT_2FA.has(ctx.path)) {
        await assertOrg2FA(ctx);
      }
      if (ctx.path === "/organization/create") {
        await assertFreeProjectLimit(ctx);
      }
      if (ORG_ADMIN_READ_PATHS.has(ctx.path)) {
        await assertOrgAdmin(ctx);
      }
    }),
    // Marks a session verified, resets the wrong-code count, signs out other sessions when a
    // factor is removed (./second-factor-hooks.ts).
    after: createAuthMiddleware(secondFactorAfter),
  },
  plugins: [
    organization({
      // Deletion goes through deleteProject() only, which refuses while a paid
      // Paddle subscription is still live.
      disableOrganizationDeletion: true,
      ...(mailerReady && {
        sendInvitationEmail: async ({ id, email, organization: org, inviter }) => {
          const acceptUrl = `${requireBaseUrl()}/accept-invitation/${id}`;
          await trySendMail(
            "invitation",
            email,
            `You've been invited to ${truncate(org.name, 100)} - Alphorn`,
            invitationEmailTemplate(
              org.name,
              inviter.user.name || inviter.user.email,
              acceptUrl,
            ),
          );
        },
      }),
    }),
    twoFactor({
      issuer: "Alphorn",
      // SSO-only users can set up an authenticator app too; users with a password still
      // confirm it.
      allowPasswordless: true,
    }),
    // rpID and origin default to BETTER_AUTH_URL's host/origin.
    passkey({
      rpName: "Alphorn",
      authenticatorSelection: {
        // A passkey sign-in counts as 2FA, so the authenticator must verify the
        // user (biometric or PIN), not just presence. Enforced at registration
        // and at every sign-in.
        userVerification: "required",
        // Discoverable credentials, so "Sign in with passkey" needs no email.
        residentKey: "required",
      },
    }),
    ...(process.env.OIDC_CLIENT_ID
      ? [
          genericOAuth({
            config: [
              {
                providerId: oidcProviderId()!,
                clientId: process.env.OIDC_CLIENT_ID,
                clientSecret: process.env.OIDC_CLIENT_SECRET!,
                discoveryUrl: process.env.OIDC_DISCOVERY_URL,
                authorizationUrl: process.env.OIDC_AUTHORIZATION_URL,
                tokenUrl: process.env.OIDC_TOKEN_URL,
                userInfoUrl: process.env.OIDC_USERINFO_URL,
                scopes: (process.env.OIDC_SCOPES || "openid profile email")
                  .split(" ")
                  .map((s) => s.trim()),
                pkce: process.env.OIDC_PKCE === "true",
              },
            ],
          }),
        ]
      : []),
  ],
});
