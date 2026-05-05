"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { requestEmailChange } from "./actions";

export function ChangeEmailDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCurrentPassword("");
    setNewEmail("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailChange(currentPassword, newEmail);
      if (result.ok) {
        toast.success(
          `Verification email sent to ${newEmail}. Click the link to complete the change.`,
        );
        reset();
        onOpenChange(false);
        return;
      }
      switch (result.reason) {
        case "invalid_password":
          setError("Incorrect password.");
          break;
        case "email_taken":
          setError("An account with that email already exists.");
          break;
        case "same_email":
          setError("That's already your email.");
          break;
        case "no_password":
          setError("Email change isn't available for SSO accounts.");
          break;
        case "rate_limited":
          setError(`Too many attempts. Try again in ${result.retryAfterSec}s.`);
          break;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
          <DialogDescription>
            Enter your current password and new email address. We&apos;ll send a
            verification link to the new address.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="change-email-password">Current password</Label>
            <Input
              id="change-email-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-email-new">New email address</Label>
            <Input
              id="change-email-new"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@example.com"
              required
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send verification email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
