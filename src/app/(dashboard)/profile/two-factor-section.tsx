"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSession, authClient, twoFactor } from "@/lib/auth/client";
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

function ChangePasswordCard() {
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

interface TwoFactorSectionProps {
  orgsRequiring2FACount: number;
}

export function TwoFactorSection({ orgsRequiring2FACount }: TwoFactorSectionProps) {
  const { data: session } = useSession();
  const is2FAEnabled = !!session?.user?.twoFactorEnabled;

  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function reset() {
    setStep("idle");
    setPassword("");
    setTotpCode("");
    setTotpURI("");
    setBackupCodes([]);
  }

  async function handleBeginSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await twoFactor.enable({ password });
      if (error) {
        showError(error, "Failed to start 2FA setup");
        return;
      }
      setTotpURI(data!.totpURI);
      setBackupCodes(data!.backupCodes);
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
      const { error } = await twoFactor.disable({ password });
      if (error) {
        showError(error, "Failed to disable 2FA");
        return;
      }
      toast.success("Two-factor authentication disabled");
      reset();
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await twoFactor.generateBackupCodes({ password });
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
      const url = new URL(totpURI);
      return url.searchParams.get("secret") ?? "";
    } catch {
      return "";
    }
  })();

  const twoFactorCard = (() => {
  // --- Idle state ---
  if (step === "idle") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription className="mt-1">
                Add an extra layer of security to your account.
              </CardDescription>
            </div>
            {is2FAEnabled ? (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <ShieldOff className="h-3 w-3" />
                Disabled
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {is2FAEnabled ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("regen-password")}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate backup codes
                </Button>
                {orgsRequiring2FACount === 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setStep("confirm-disable")}
                  >
                    <ShieldOff className="mr-2 h-4 w-4" />
                    Disable 2FA
                  </Button>
                )}
              </div>
              {orgsRequiring2FACount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {orgsRequiring2FACount === 1
                    ? "1 project requires"
                    : `${orgsRequiring2FACount} projects require`}{" "}
                  two-factor authentication. You cannot disable 2FA while you
                  are a member of these projects.
                </p>
              )}
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => setStep("setup")}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Enable 2FA
              </Button>
              {orgsRequiring2FACount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {orgsRequiring2FACount === 1
                    ? "1 project requires"
                    : `${orgsRequiring2FACount} projects require`}{" "}
                  two-factor authentication. Please enable it to continue
                  accessing those projects.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // --- Setup step: enter password ---
  if (step === "setup") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enable Two-Factor Authentication</CardTitle>
          <CardDescription>
            Confirm your password to begin setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBeginSetup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="2fa-setup-password">Current password</Label>
              <Input
                id="2fa-setup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Continuing..." : "Continue"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // --- Verify step: scan QR + enter TOTP code ---
  if (step === "verify") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scan QR Code</CardTitle>
          <CardDescription>
            Scan the QR code with your authenticator app, then enter the
            6-digit code to verify.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {totpURI && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-lg border p-3 bg-white">
                <QRCodeSVG value={totpURI} size={180} />
              </div>
              {totpSecret && (
                <details className="w-full">
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    Can&apos;t scan? Enter manually
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
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
                required
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // --- Backup codes step (after setup) ---
  if (step === "backup-codes") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Save your backup codes</CardTitle>
          <CardDescription>
            Store these codes somewhere safe. Each code can only be used once
            to sign in if you lose access to your authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-md border p-4 font-mono text-sm">
            {backupCodes.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyBackupCodes}>
              <Copy className="mr-2 h-4 w-4" />
              Copy codes
            </Button>
          </div>
          <Button
            onClick={() => {
              toast.success("Two-factor authentication enabled");
              reset();
            }}
          >
            I&apos;ve saved these codes
          </Button>
        </CardContent>
      </Card>
    );
  }

  // --- Confirm disable step ---
  if (step === "confirm-disable") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Disable Two-Factor Authentication</CardTitle>
          <CardDescription>
            Enter your password to confirm disabling 2FA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleDisable} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="disable-password">Current password</Label>
              <Input
                id="disable-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? "Disabling..." : "Disable 2FA"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // --- Regen backup codes: password step ---
  if (step === "regen-password") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Regenerate Backup Codes</CardTitle>
          <CardDescription>
            Enter your password to generate new backup codes. Your old codes
            will be invalidated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegenPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regen-password">Current password</Label>
              <Input
                id="regen-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Generating..." : "Generate new codes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // --- Regen backup codes: display step ---
  if (step === "regen-codes") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>New Backup Codes</CardTitle>
          <CardDescription>
            Your old backup codes have been invalidated. Save these new codes
            somewhere safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-md border p-4 font-mono text-sm">
            {backupCodes.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyBackupCodes}>
              <Copy className="mr-2 h-4 w-4" />
              Copy codes
            </Button>
          </div>
          <Button
            onClick={() => {
              toast.success("Backup codes regenerated");
              reset();
            }}
          >
            I&apos;ve saved these codes
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
  })();

  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      {twoFactorCard}
    </div>
  );
}
