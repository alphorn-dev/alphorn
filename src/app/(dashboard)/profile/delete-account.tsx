"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount } from "./actions";
import { authClient } from "@/lib/auth/client";
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
import { showError } from "@/lib/toast-error";
import { Fingerprint, TriangleAlert } from "lucide-react";

const CONFIRM_PHRASE = "delete my account";

export function DeleteAccountCard({
  hasPassword,
  hasTotp,
  hasPasskey,
}: {
  hasPassword: boolean;
  hasTotp: boolean;
  hasPasskey: boolean;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // Set once the server asked for a fresh second factor.
  const [needsFactor, setNeedsFactor] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmed =
    confirmation === CONFIRM_PHRASE &&
    (!hasPassword || password.length > 0) &&
    (!needsFactor || !hasTotp || code.length === 6);

  // Proves the second factor for this session (stamps secondFactorAt), if asked for.
  async function proveFactor(usePasskey: boolean): Promise<boolean> {
    if (!needsFactor) return true;
    const res = usePasskey
      ? await authClient.signIn.passkey()
      : await authClient.twoFactor.verifyTotp({ code });
    if (res?.error) {
      showError(res.error, "Verification failed");
      return false;
    }
    return true;
  }

  async function handleDelete(usePasskey = false) {
    setDeleting(true);
    try {
      if (!(await proveFactor(usePasskey))) return;
      const result = await deleteAccount(hasPassword ? password : undefined);
      if (result.ok) {
        router.push("/sign-in");
        return;
      }
      if (result.reason === "invalid_password") {
        showError(new Error("Incorrect password"), "Incorrect password");
      } else if (result.reason === "second_factor_required") {
        setNeedsFactor(true);
      } else if (result.reason === "rate_limited") {
        showError(
          new Error(`Too many attempts. Try again in ${result.retryAfterSec}s.`),
          "Too many attempts",
        );
      }
    } catch (err) {
      showError(err, "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-5 w-5 text-destructive" />
          <CardTitle>Delete Account</CardTitle>
        </div>
        <CardDescription>
          Permanently delete your account and all associated data. Projects
          where you are the only member will be deleted along with all their
          webhooks, channels, and messages. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="delete-confirm">
            Type <span className="font-semibold">{CONFIRM_PHRASE}</span> to
            confirm
          </Label>
          <Input
            id="delete-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            disabled={deleting}
          />
        </div>
        {hasPassword && (
          <div className="space-y-2">
            <Label htmlFor="delete-password">Your password</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={deleting}
            />
          </div>
        )}
        {needsFactor && hasTotp && (
          <div className="space-y-2">
            <Label htmlFor="delete-code">Code from your authenticator app</Label>
            <Input
              id="delete-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              disabled={deleting}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {needsFactor && !hasTotp && hasPasskey ? (
            <Button
              variant="destructive"
              onClick={() => handleDelete(true)}
              disabled={!confirmed || deleting}
            >
              <Fingerprint className="size-4" />
              {deleting ? "Deleting..." : "Confirm with passkey and delete"}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => handleDelete()}
              disabled={!confirmed || deleting}
            >
              {deleting ? "Deleting..." : "Delete account permanently"}
            </Button>
          )}
        </div>
        {needsFactor && (
          <p className="text-sm text-muted-foreground">
            Confirm with your second factor to delete your account.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
