"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectSettings } from "./project-settings";
import { DeleteProjectCard } from "./delete-project";
import { SettingsForm } from "./settings-form";
import { SecuritySettings } from "./security-settings";
import { MembersSection } from "./members-section";
import type { ChannelOption } from "@/channels/types";

export function SettingsTabs({
  projectName,
  failureNotificationChannelId,
  channels,
  requireTwoFactor,
  isAdminOrOwner,
  currentUserId,
  callerRole,
  callerSatisfies2FA,
  mailerConfigured,
}: {
  projectName: string;
  failureNotificationChannelId: string | null;
  channels: ChannelOption[];
  requireTwoFactor: boolean;
  isAdminOrOwner: boolean;
  currentUserId: string;
  callerRole: string;
  callerSatisfies2FA: boolean;
  mailerConfigured: boolean;
}) {
  return (
    <Tabs defaultValue="general">
      <TabsList variant="line">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="notifications">Failure Notifications</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        {isAdminOrOwner && (
          <TabsTrigger value="security">Security</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="general" className="mt-6 space-y-6">
        <ProjectSettings name={projectName} />
        {callerRole === "owner" && (
          <DeleteProjectCard projectName={projectName} />
        )}
      </TabsContent>

      <TabsContent value="notifications" className="mt-6">
        <SettingsForm
          currentFailureNotificationChannelId={failureNotificationChannelId}
          channels={channels}
        />
      </TabsContent>

      <TabsContent value="team" className="mt-6">
        <MembersSection currentUserId={currentUserId} callerRole={callerRole} mailerConfigured={mailerConfigured} />
      </TabsContent>

      {isAdminOrOwner && (
        <TabsContent value="security" className="mt-6">
          <SecuritySettings
            requireTwoFactor={requireTwoFactor}
            callerSatisfies2FA={callerSatisfies2FA}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
