import { getOrgSettings, getOrgSecuritySettings, getProjectName } from "./actions";
import { getChannelsForOrg } from "../channels/actions";
import { SettingsTabs } from "./settings-tabs";
import {
  requireSession,
  getMemberRole,
  currentUserSatisfies2FA,
} from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { isMailerConfigured } from "@/lib/email/mailer";

export default async function SettingsPage() {
  const session = await requireSession();

  const [
    role,
    settings,
    channels,
    securitySettings,
    projectName,
    callerSatisfies2FA,
  ] = await Promise.all([
    getMemberRole(),
    getOrgSettings(),
    getChannelsForOrg(),
    getOrgSecuritySettings(),
    getProjectName(),
    currentUserSatisfies2FA(),
  ]);
  if (!role || !["owner", "admin"].includes(role)) {
    redirect("/");
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Manage your project configuration and team.
      </p>

      <SettingsTabs
        projectName={projectName ?? ""}
        failureNotificationChannelId={settings?.failureNotificationChannelId || null}
        channels={channels.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
        }))}
        requireTwoFactor={securitySettings?.requireTwoFactor ?? false}
        isAdminOrOwner={true}
        currentUserId={session.user.id}
        callerRole={role!}
        callerSatisfies2FA={callerSatisfies2FA}
        mailerConfigured={isMailerConfigured()}
      />
    </div>
  );
}
