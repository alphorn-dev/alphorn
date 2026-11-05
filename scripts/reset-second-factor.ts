// Account recovery for a user who lost every second factor (e.g. their only passkey):
// removes their passkeys and authenticator app, and signs them out everywhere. They then sign
// in with their password or SSO and can set up a new factor.
//
// Only run this after verifying the person's identity out of band: it removes the protection
// the factor gave.
//
//   pnpm reset-2fa <email>

import { prisma } from "@/lib/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: pnpm reset-2fa <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error("No user with that email.");
    process.exit(1);
  }

  const [passkeys, twoFactors] = await prisma.$transaction([
    prisma.passkey.deleteMany({ where: { userId: user.id } }),
    prisma.twoFactor.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  console.log(
    `User ${user.id}: removed ${passkeys.count} passkey(s) and ${twoFactors.count} authenticator app(s), signed out everywhere.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
