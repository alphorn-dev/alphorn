import { cache } from "react";
import { headers } from "next/headers";
import { auth } from ".";

/**
 * Trust-the-IdP policy: a user satisfies 2FA if they have TOTP enabled,
 * OR if they can sign in via a trusted SSO provider (we assume the IdP
 * enforces MFA upstream). Users who only have a password must enable 2FA.
 */
const userHasSsoAccount = cache(async (userId: string): Promise<boolean> => {
  const { prisma } = await import("../db");
  const account = await prisma.account.findFirst({
    where: { userId, providerId: { not: "credential" } },
    select: { id: true },
  });
  return !!account;
});

async function userSatisfies2FA(
  userId: string,
  twoFactorEnabled: boolean,
): Promise<boolean> {
  if (twoFactorEnabled) return true;
  return userHasSsoAccount(userId);
}

async function resolveActiveOrgId(
  userId: string,
  currentOrgId: string | null,
  satisfies2FA: boolean,
): Promise<string | null> {
  const { prisma } = await import("../db");

  if (currentOrgId && !satisfies2FA) {
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: currentOrgId },
      select: { requireTwoFactor: true },
    });
    if (settings?.requireTwoFactor) {
      await auth.api.setActiveOrganization({
        headers: await headers(),
        body: { organizationId: null },
      });
      currentOrgId = null;
    }
  }

  if (currentOrgId) return currentOrgId;

  const memberships = await prisma.member.findMany({
    where: { userId },
    select: { organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  let selectedOrgId: string | null = null;
  if (satisfies2FA) {
    selectedOrgId = memberships[0].organizationId;
  } else {
    const orgIds = memberships.map((m) => m.organizationId);
    const locked = new Set(
      (
        await prisma.organizationSettings.findMany({
          where: { organizationId: { in: orgIds }, requireTwoFactor: true },
          select: { organizationId: true },
        })
      ).map((s) => s.organizationId),
    );
    const accessible = memberships.find((m) => !locked.has(m.organizationId));
    selectedOrgId = accessible?.organizationId ?? null;
  }

  if (selectedOrgId) {
    await auth.api.setActiveOrganization({
      headers: await headers(),
      body: { organizationId: selectedOrgId },
    });
  }
  return selectedOrgId;
}

export const getSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) return null;

  const satisfies2FA = await userSatisfies2FA(
    session.user.id,
    session.user.twoFactorEnabled ?? false,
  );
  const resolvedOrgId = await resolveActiveOrgId(
    session.user.id,
    session.session.activeOrganizationId ?? null,
    satisfies2FA,
  );

  if (resolvedOrgId === session.session.activeOrganizationId) return session;
  return {
    ...session,
    session: { ...session.session, activeOrganizationId: resolvedOrgId },
  };
});

export const requireSession = cache(async () => {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const orgId = session.session.activeOrganizationId;
  if (orgId) {
    const satisfies2FA = await userSatisfies2FA(
      session.user.id,
      session.user.twoFactorEnabled ?? false,
    );
    if (!satisfies2FA) {
      const { prisma } = await import("../db");
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: orgId },
        select: { requireTwoFactor: true },
      });
      if (settings?.requireTwoFactor) {
        throw new Error("Two-factor authentication is required for this project");
      }
    }
  }

  return session;
});

export const requireOrgSession = cache(async () => {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    throw new Error("No active project");
  }
  return { session, orgId };
});

export const getMemberRole = cache(async (): Promise<string | null> => {
  const session = await getSession();
  if (!session) return null;

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;

  const { prisma } = await import("../db");
  const member = await prisma.member.findFirst({
    where: { organizationId: orgId, userId: session.user.id },
    select: { role: true },
  });

  return member?.role ?? null;
});

export async function requireAdminOrOwner() {
  const { session, orgId } = await requireOrgSession();
  const role = await getMemberRole();
  if (!role || !["owner", "admin"].includes(role)) {
    throw new Error("Permission denied");
  }
  return { session, orgId, role };
}

/**
 * Whether the current user can self-manage 2FA (enable/disable/regenerate).
 * Not possible for users without a password (SSO-only) because Better Auth's
 * 2FA flow requires password confirmation at every step.
 */
export const currentUserHas2FACapability = cache(async (): Promise<boolean> => {
  const session = await getSession();
  if (!session) return false;
  const { prisma } = await import("../db");
  const credential = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "credential" },
    select: { id: true },
  });
  return !!credential;
});

export const currentUserHasPassword = currentUserHas2FACapability;

/**
 * Whether the current session user satisfies the "has 2FA" bar used by
 * org-level 2FA enforcement: TOTP enabled, OR signed in via a trusted SSO
 * provider. Returns false when there is no session.
 */
export const currentUserSatisfies2FA = cache(async (): Promise<boolean> => {
  const session = await getSession();
  if (!session) return false;
  return userSatisfies2FA(
    session.user.id,
    session.user.twoFactorEnabled ?? false,
  );
});

/**
 * Orgs whose `requireTwoFactor` the current user fails. Returns [] when the
 * user satisfies 2FA (TOTP enabled or SSO-trusted).
 */
export const currentUserOrgs2FAGap = cache(async (): Promise<string[]> => {
  const session = await getSession();
  if (!session) return [];

  const satisfies2FA = await userSatisfies2FA(
    session.user.id,
    session.user.twoFactorEnabled ?? false,
  );
  if (satisfies2FA) return [];

  const { prisma } = await import("../db");
  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id },
    select: { organizationId: true },
  });
  if (memberships.length === 0) return [];

  const settings = await prisma.organizationSettings.findMany({
    where: {
      organizationId: { in: memberships.map((m) => m.organizationId) },
      requireTwoFactor: true,
    },
    select: { organizationId: true },
  });
  return settings.map((s) => s.organizationId);
});
