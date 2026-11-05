import { getAuthenticatorName } from "@better-auth/passkey";
import {
  requireSession,
  currentUserHasPassword,
} from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format-date";
import { ProfileTabs } from "./profile-tabs";
import { getOrgs2FARequirements } from "../settings/actions";
import { isMailerConfigured } from "@/lib/email/mailer";

export default async function ProfilePage() {
  const session = await requireSession();

  const [orgsRequiring2FA, userHasPassword, passkeys] = await Promise.all([
    getOrgs2FARequirements(),
    currentUserHasPassword(),
    prisma.passkey.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, aaguid: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Manage your account settings.
      </p>
      <ProfileTabs
        orgsRequiring2FACount={orgsRequiring2FA.length}
        mailerConfigured={isMailerConfigured()}
        userHasPassword={userHasPassword}
        passkeys={passkeys.map((p) => ({
          id: p.id,
          label: p.name || getAuthenticatorName(p.aaguid) || "Passkey",
          added: p.createdAt ? formatDate(p.createdAt) : null,
        }))}
      />
    </div>
  );
}
