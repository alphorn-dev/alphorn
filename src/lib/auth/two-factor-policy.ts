import { cache } from "react";

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

export async function userSatisfies2FA(
  userId: string,
  twoFactorEnabled: boolean,
): Promise<boolean> {
  if (twoFactorEnabled) return true;
  return userHasSsoAccount(userId);
}
