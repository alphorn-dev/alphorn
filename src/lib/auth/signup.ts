import { prisma } from "../db";

/**
 * Public sign-up is open unless DISABLE_SIGNUP=true. Even then it stays open
 * while no user exists, so a fresh install can create its first account.
 */
export async function isSignupOpen(): Promise<boolean> {
  if (process.env.DISABLE_SIGNUP !== "true") return true;
  return (await prisma.user.count()) === 0;
}

/**
 * Whether a new account may be created for this email. With sign-up closed,
 * only emails holding a pending, unexpired invitation get through. Invite
 * links carry no email, so they only work for existing accounts then.
 */
export async function canCreateUser(email: string): Promise<boolean> {
  if (await isSignupOpen()) return true;
  const invitation = await prisma.invitation.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return invitation !== null;
}
