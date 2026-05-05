"use client";

import { useState } from "react";
import { updateRequireTwoFactor } from "./actions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";

export function SecuritySettings({
  requireTwoFactor,
  callerSatisfies2FA,
}: {
  requireTwoFactor: boolean;
  callerSatisfies2FA: boolean;
}) {
  const [enabled, setEnabled] = useState(requireTwoFactor);
  const [pending, setPending] = useState(false);

  // Block enabling (but never disabling) while the caller doesn't satisfy 2FA,
  // so they can't lock themselves out. The server enforces the same rule.
  const blockEnable = !callerSatisfies2FA && !enabled;

  async function handleToggle(checked: boolean) {
    const previous = enabled;
    setEnabled(checked);
    setPending(true);
    try {
      await updateRequireTwoFactor(checked);
      toast.success(
        checked
          ? "Two-factor authentication is now required for all members"
          : "Two-factor authentication requirement removed",
      );
    } catch (err) {
      setEnabled(previous);
      showError(err, "Failed to update security settings");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-Factor Authentication</CardTitle>
        <CardDescription>
          Require all members of this project to have two-factor authentication
          enabled before they can access the organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {blockEnable && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Enable 2FA on your own account first (Profile → Security) before
              requiring it for everyone, or you will lock yourself out.
            </span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Switch
            id="require-2fa"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={pending || blockEnable}
          />
          <Label htmlFor="require-2fa">Require 2FA for all members</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          When enabled, members without 2FA will be prompted to set it up before
          accessing project resources.
        </p>
      </CardContent>
    </Card>
  );
}
