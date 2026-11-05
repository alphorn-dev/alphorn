import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from ".";
import { sessionSatisfies2FA } from "./two-factor-policy";
import { factorState } from "./second-factor-hooks";
import { secondFactorPending } from "./second-factor";

async function resolveActiveOrgId(
  userId: string,
  currentOrgId: string | null,
  satisfies2FA: boolean,
): Promise<string | null> {
  const { prisma } = await import("../db");

  if (currentOrgId) {
    // Removing a member doesn't touch their sessions, so re-check membership on every request.
    const member = await prisma.member.findFirst({
      where: { organizationId: currentOrgId, userId },
      select: { id: true },
    });
    const locked =
      !satisfies2FA &&
      !!(
        await prisma.organizationSettings.findUnique({
          where: { organizationId: currentOrgId },
          select: { requireTwoFactor: true },
        })
      )?.requireTwoFactor;
    if (!member || locked) {
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

/** The Better Auth session as stored, pending or not. Prefer getSession(). */
export const getRawSession = cache(async () =>
  auth.api.getSession({
    headers: await headers(),
  }),
);

/**
 * Signed in, but this session still owes its second factor (./second-factor.ts). Such a
 * session counts as signed out everywhere; send the user to /verify-2fa.
 */
export const isSecondFactorPending = cache(async (): Promise<boolean> => {
  const session = await getRawSession();
  if (!session) return false;
  return secondFactorPending(
    await factorState(session.user.id),
    session.session.secondFactorAt ?? null,
  );
});

/** The signed-in session, or null when signed out or the second factor is still pending. */
export const getSession = cache(async () => {
  const session = await getRawSession();
  if (!session || (await isSecondFactorPending())) return null;

  const satisfies2FA = await sessionSatisfies2FA(session);
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
    // Signed out, or the second factor is still owed. redirect() is control flow, not an error:
    // pages rendered next to the layout's own redirect, and actions fired from a page whose
    // session just ended (e.g. the project switcher), no longer log or report an error.
    redirect((await isSecondFactorPending()) ? "/verify-2fa" : "/sign-in");
  }

  const orgId = session.session.activeOrganizationId;
  if (orgId) {
    const satisfies2FA = await sessionSatisfies2FA(session);
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
 * Whether the current session user has a password (credential) account, as
 * opposed to being SSO-only. Returns false when there is no session.
 */
export const currentUserHasPassword = cache(async (): Promise<boolean> => {
  const session = await getSession();
  if (!session) return false;
  const { prisma } = await import("../db");
  const credential = await prisma.account.findFirst({
    // With a hash, like hasPassword() in ./second-factor-hooks.ts and Better Auth itself.
    where: { userId: session.user.id, providerId: "credential", password: { not: null } },
    select: { id: true },
  });
  return !!credential;
});

/**
 * Whether the current user can self-manage 2FA (enable/disable/regenerate).
 * Equivalent to having a password: Better Auth's 2FA flow requires password
 * confirmation at every step, so SSO-only users cannot self-manage it.
 */
export const currentUserHas2FACapability = currentUserHasPassword;

/**
 * Whether the current session satisfies the "has 2FA" bar used by org-level
 * 2FA enforcement (see sessionSatisfies2FA). Returns false when there is no
 * session.
 */
export const currentUserSatisfies2FA = cache(async (): Promise<boolean> => {
  const session = await getSession();
  if (!session) return false;
  return sessionSatisfies2FA(session);
});

/**
 * Orgs whose `requireTwoFactor` the current user fails. Returns [] when the
 * session satisfies 2FA (proven TOTP/passkey, or an SSO sign-in session).
 */
export const currentUserOrgs2FAGap = cache(async (): Promise<string[]> => {
  const session = await getSession();
  if (!session) return [];

  const satisfies2FA = await sessionSatisfies2FA(session);
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
