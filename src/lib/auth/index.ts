import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../db";
import { logger } from "../logger";
import { isMailerConfigured, sendMail } from "../email/mailer";
import { userSatisfies2FA } from "./two-factor-policy";
import { canCreateUser } from "./signup";
import { truncate } from "@/channels/truncate";
import {
  verificationEmailTemplate,
  invitationEmailTemplate,
  passwordResetEmailTemplate,
} from "../email/templates";

const mailerReady = isMailerConfigured();

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
    logger.error({ component: "mailer", label, error: err instanceof Error ? err.message : "Unknown error" }, "Failed to send email");
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

/**
 * Enforces the project's `requireTwoFactor` on Better Auth's organization API,
 * which clients can call directly and so bypasses the server-action gate in
 * requireSession().
 */
async function assertOrg2FA(ctx: Parameters<typeof getSessionFromCtx>[0]): Promise<void> {
  const session = await getSessionFromCtx(ctx);
  if (!session) return; // the endpoint itself rejects unauthenticated calls

  const body = ctx.body as { organizationId?: string | null; organizationSlug?: string } | undefined;
  const query = ctx.query as { organizationId?: string; organizationSlug?: string } | undefined;
  let orgId: string | null | undefined = body?.organizationId ?? query?.organizationId;
  const slug = body?.organizationSlug ?? query?.organizationSlug;
  if (!orgId && slug) {
    orgId = (await prisma.organization.findUnique({ where: { slug }, select: { id: true } }))?.id;
  }
  // set-active with organizationId: null clears the active project.
  if (orgId === null && ctx.path === "/organization/set-active") return;
  orgId ??= session.session.activeOrganizationId;
  if (!orgId) return;

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { requireTwoFactor: true },
  });
  if (!settings?.requireTwoFactor) return;
  if (await userSatisfies2FA(session.user.id, session.user.twoFactorEnabled ?? false)) return;

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
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: mailerReady,
    ...(mailerReady && {
      sendResetPassword: async ({ user, url }) => {
        await trySendMail(
          "password reset",
          user.email,
          "Reset your password — Alphorn",
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
            "Verify your email — Alphorn",
            verificationEmailTemplate(url),
          );
        },
      }
    : undefined,
  user: {
    changeEmail: mailerReady ? { enabled: true } : undefined,
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google", "microsoft"],
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
    }),
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
            `You've been invited to ${truncate(org.name, 100)} — Alphorn`,
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
    }),
    ...(process.env.OIDC_CLIENT_ID
      ? [
          genericOAuth({
            config: [
              {
                providerId: process.env.OIDC_PROVIDER_ID || "custom-oidc",
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
