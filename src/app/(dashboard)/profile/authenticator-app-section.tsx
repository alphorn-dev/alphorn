"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession, authClient, twoFactor } from "@/lib/auth/client";
import { REAUTH_HINT } from "@/lib/auth/second-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ShieldCheck, ShieldOff, Copy, RefreshCw } from "lucide-react";

const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((mod) => ({ default: mod.QRCodeSVG })),
  { ssr: false },
);

export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const { error } = await authClient.changePassword({ currentPassword, newPassword });
      if (error) {
        showError(error, "Failed to change password");
        return;
      }
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Update your password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={saving}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Changing..." : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

type Step =
  | "idle"
  | "setup"
  | "verify"
  | "backup-codes"
  | "confirm-disable"
  | "regen-password"
  | "regen-codes";

/**
 * Authenticator app (TOTP). Better Auth runs with allowPasswordless, so users without a
 * password (SSO-only) skip the password prompts; users with one still confirm it.
 */
export function AuthenticatorAppSection({ userHasPassword }: { userHasPassword: boolean }) {
  const router = useRouter();
  const { data: session } = useSession();
  const isEnabled = !!session?.user?.twoFactorEnabled;

  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const pw = () => (userHasPassword ? { password } : {});

  function reset() {
    setStep("idle");
    setPassword("");
    setTotpCode("");
    setTotpURI("");
    setBackupCodes([]);
  }

  async function beginSetup(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await twoFactor.enable({ ...pw(), method: "totp" });
      if (error || data.method !== "totp") {
        showError(error, "Failed to start setup");
        return;
      }
      setTotpURI(data.totpURI);
      setBackupCodes(data.backupCodes);
      setPassword("");
      setStep("verify");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await twoFactor.verifyTotp({ code: totpCode });
      if (error) {
        showError(error, "Invalid code");
        return;
      }
      setTotpCode("");
      setStep("backup-codes");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await twoFactor.disable(pw());
      if (error) {
        showError(error, "Failed to turn off the authenticator app");
        return;
      }
      toast.success("Authenticator app turned off");
      reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function regenerate(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await twoFactor.generateBackupCodes(pw());
      if (error) {
        showError(error, "Failed to generate backup codes");
        return;
      }
      setBackupCodes(data!.backupCodes);
      setPassword("");
      setStep("regen-codes");
    } finally {
      setLoading(false);
    }
  }

  async function copyBackupCodes() {
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success("Backup codes copied to clipboard");
  }

  // Extract the secret from totpURI for manual entry
  const totpSecret = (() => {
    try {
      return new URL(totpURI).searchParams.get("secret") ?? "";
    } catch {
      return "";
    }
  })();

  const passwordField = (id: string) =>
    userHasPassword && (
      <div className="space-y-2">
        <Label htmlFor={id}>Current password</Label>
        <Input
          id={id}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
          autoFocus
        />
      </div>
    );

  const cancel = (
    <Button type="button" variant="ghost" onClick={reset} disabled={loading}>
      Cancel
    </Button>
  );

  const codesList = (
    <>
      <div className="grid grid-cols-2 gap-2 rounded-md border p-4 font-mono text-sm">
        {backupCodes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={copyBackupCodes}>
        <Copy className="mr-2 h-4 w-4" />
        Copy codes
      </Button>
    </>
  );

  let title = "Authenticator app";
  let description =
    "A 6-digit code from an app like 1Password, Google Authenticator or Authy, asked at sign-in when you don't use a passkey. Comes with backup codes in case you lose your phone.";
  let body: React.ReactNode;

  if (step === "idle") {
    if (!userHasPassword) description += ` ${REAUTH_HINT}`;
    body = isEnabled ? (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => (userHasPassword ? setStep("regen-password") : regenerate())}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          New backup codes
        </Button>
        <Button variant="outline" size="sm" onClick={() => setStep("confirm-disable")}>
          <ShieldOff className="mr-2 h-4 w-4" />
          Turn off
        </Button>
      </div>
    ) : (
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => (userHasPassword ? setStep("setup") : beginSetup())}
      >
        <ShieldCheck className="mr-2 h-4 w-4" />
        Set up authenticator app
      </Button>
    );
  } else if (step === "setup") {
    description = "Confirm your password to begin setup.";
    body = (
      <form onSubmit={beginSetup} className="space-y-4">
        {passwordField("2fa-setup-password")}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Continuing..." : "Continue"}
          </Button>
          {cancel}
        </div>
      </form>
    );
  } else if (step === "verify") {
    title = "Scan the QR code";
    description =
      "Scan the QR code with your authenticator app, then enter the 6-digit code it shows.";
    body = (
      <div className="space-y-6">
        {totpURI && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-lg border bg-white p-3">
              <QRCodeSVG value={totpURI} size={180} />
            </div>
            {totpSecret && (
              <details className="w-full">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Can&apos;t scan? Enter the key manually
                </summary>
                <div className="mt-2 rounded-md bg-muted p-3 font-mono text-sm break-all select-all">
                  {totpSecret}
                </div>
              </details>
            )}
          </div>
        )}
        <form onSubmit={handleVerifyTotp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="totp-code">6-digit code</Label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              disabled={loading}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Turn on"}
            </Button>
            {cancel}
          </div>
        </form>
      </div>
    );
  } else if (step === "backup-codes" || step === "regen-codes") {
    title = step === "backup-codes" ? "Save your backup codes" : "New backup codes";
    description =
      step === "backup-codes"
        ? "Each code works once if you lose your phone. Save them somewhere safe now, they won't be shown again."
        : "Your old backup codes no longer work. Save these somewhere safe.";
    body = (
      <div className="space-y-4">
        {codesList}
        <div>
          <Button
            onClick={() => {
              toast.success(
                step === "backup-codes" ? "Authenticator app is on" : "Backup codes regenerated",
              );
              reset();
              router.refresh();
            }}
          >
            I&apos;ve saved these codes
          </Button>
        </div>
      </div>
    );
  } else if (step === "confirm-disable") {
    title = "Turn off the authenticator app?";
    description =
      "Your backup codes stop working too, and you're signed out on all other devices." +
      (userHasPassword ? " Enter your password to confirm." : "");
    body = (
      <form onSubmit={handleDisable} className="space-y-4">
        {passwordField("disable-password")}
        <div className="flex gap-2">
          <Button type="submit" variant="destructive" disabled={loading}>
            {loading ? "Turning off..." : "Turn off"}
          </Button>
          {cancel}
        </div>
      </form>
    );
  } else if (step === "regen-password") {
    title = "New backup codes";
    description = "Enter your password to generate new backup codes. Your old codes stop working.";
    body = (
      <form onSubmit={regenerate} className="space-y-4">
        {passwordField("regen-password")}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Generating..." : "Generate new codes"}
          </Button>
          {cancel}
        </div>
      </form>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          {step === "idle" &&
            (isEnabled ? (
              <Badge variant="default" className="shrink-0 gap-1">
                <ShieldCheck className="h-3 w-3" />
                On
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0 gap-1">
                <ShieldOff className="h-3 w-3" />
                Off
              </Badge>
            ))}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
