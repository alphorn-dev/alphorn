import {
  requireSession,
  currentUserHas2FACapability,
  currentUserHasPassword,
} from "@/lib/auth/server";
import { ProfileTabs } from "./profile-tabs";
import { getOrgs2FARequirements } from "../settings/actions";
import { isMailerConfigured } from "@/lib/email/mailer";

export default async function ProfilePage() {
  const session = await requireSession();

  const [orgsRequiring2FA, can2FA, userHasPassword] = await Promise.all([
    getOrgs2FARequirements(),
    currentUserHas2FACapability(),
    currentUserHasPassword(),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Manage your account settings.
      </p>
      <ProfileTabs
        orgsRequiring2FACount={orgsRequiring2FA.length}
        has2FAEnabled={!!session.user.twoFactorEnabled}
        can2FA={can2FA}
        mailerConfigured={isMailerConfigured()}
        userHasPassword={userHasPassword}
      />
    </div>
  );
}
