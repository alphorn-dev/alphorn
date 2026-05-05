"use client";

import { useState } from "react";
import { useSession, authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ChangeEmailDialog } from "./change-email-dialog";

export function ProfileSection({
  mailerConfigured,
  userHasPassword,
}: {
  mailerConfigured: boolean;
  userHasPassword: boolean;
}) {
  const { data: session } = useSession();
  const [name, setName] = useState(session?.user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      const { error } = await authClient.updateUser({ name });
      if (error) {
        showError(error, "Failed to update name");
        return;
      }
      toast.success("Name updated");
    } finally {
      setSavingName(false);
    }
  }

  const canChangeEmail = mailerConfigured && userHasPassword;
  const emailHelp = !mailerConfigured
    ? "Email change is unavailable on this instance."
    : !userHasPassword
      ? "Email is managed by your sign-in provider."
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your personal information.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpdateName} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={savingName}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <div className="flex gap-2">
              <Input value={session?.user?.email || ""} disabled className="flex-1" />
              {canChangeEmail && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEmailDialogOpen(true)}
                >
                  Change email
                </Button>
              )}
            </div>
            {emailHelp && (
              <p className="text-xs text-muted-foreground">{emailHelp}</p>
            )}
          </div>
          <Button type="submit" disabled={savingName}>
            {savingName ? "Saving..." : "Save name"}
          </Button>
        </form>
      </CardContent>
      {canChangeEmail && (
        <ChangeEmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
        />
      )}
    </Card>
  );
}
