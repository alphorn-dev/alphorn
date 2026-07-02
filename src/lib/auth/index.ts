import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { genericOAuth, microsoftEntraId } from "better-auth/plugins/generic-oauth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../db";
import { logger } from "../logger";
import { isMailerConfigured, sendMail } from "../email/mailer";
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
    logger.error({ component: "mailer", label, to, error: err instanceof Error ? err.message : "Unknown error" }, "Failed to send email");
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
      trustedProviders: ["github", "google", "microsoft-entra-id"],
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
  },
  rateLimit: {
    enabled: true,
    storage: "database",
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
      }
    }),
  },
  plugins: [
    organization({
      ...(mailerReady && {
        sendInvitationEmail: async ({ id, email, organization: org, inviter }) => {
          const acceptUrl = `${requireBaseUrl()}/accept-invitation/${id}`;
          await trySendMail(
            "invitation",
            email,
            `You've been invited to ${org.name} — Alphorn`,
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
    ...(() => {
      const oauthConfigs = [];
      if (process.env.MICROSOFT_CLIENT_ID) {
        oauthConfigs.push(
          microsoftEntraId({
            clientId: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
            tenantId: process.env.MICROSOFT_TENANT_ID || "common",
          }),
        );
      }
      if (process.env.OIDC_CLIENT_ID) {
        oauthConfigs.push({
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
        });
      }
      return oauthConfigs.length > 0
        ? [genericOAuth({ config: oauthConfigs })]
        : [];
    })(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
