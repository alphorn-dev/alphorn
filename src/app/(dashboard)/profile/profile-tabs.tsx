"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProfileSection } from "./profile-section";
import { TwoFactorSection } from "./two-factor-section";
import { SsoSecuritySection } from "./sso-security-section";
import { DeleteAccountCard } from "./delete-account";
import { ShieldAlert } from "lucide-react";

export function ProfileTabs({
  orgsRequiring2FACount,
  has2FAEnabled,
  can2FA,
  mailerConfigured,
  userHasPassword,
}: {
  orgsRequiring2FACount: number;
  has2FAEnabled: boolean;
  can2FA: boolean;
  mailerConfigured: boolean;
  userHasPassword: boolean;
}) {
  return (
    <div className="space-y-6">
      {orgsRequiring2FACount > 0 && !has2FAEnabled && can2FA && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {orgsRequiring2FACount === 1
              ? "1 of your projects requires"
              : `${orgsRequiring2FACount} of your projects require`}{" "}
            two-factor authentication. Enable 2FA in the{" "}
            <strong>Security</strong> tab to continue accessing{" "}
            {orgsRequiring2FACount === 1 ? "it" : "them"}.
          </span>
        </div>
      )}

      <Tabs defaultValue="account">
        <TabsList variant="line">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="danger">Danger zone</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-6">
          <ProfileSection
            mailerConfigured={mailerConfigured}
            userHasPassword={userHasPassword}
          />
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          {can2FA ? (
            <TwoFactorSection orgsRequiring2FACount={orgsRequiring2FACount} />
          ) : (
            <SsoSecuritySection />
          )}
        </TabsContent>

        <TabsContent value="danger" className="mt-6">
          <DeleteAccountCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
