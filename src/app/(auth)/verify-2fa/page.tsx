"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { showError } from "@/lib/toast-error";

export default function Verify2FAPage() {
  return (
    <Suspense>
      <Verify2FAForm />
    </Suspense>
  );
}

function Verify2FAForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });

    if (error) {
      showError(error, "Verification failed");
      setLoading(false);
      return;
    }

    router.push(redirectTo || "/");
  }

  function handleToggleMode() {
    setCode("");
    setUseBackupCode((prev) => !prev);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Two-factor verification</CardTitle>
        <CardDescription>
          {useBackupCode
            ? "Enter one of your backup codes to continue"
            : "Enter the 6-digit code from your authenticator app"}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">
              {useBackupCode ? "Backup code" : "Authentication code"}
            </Label>
            {useBackupCode ? (
              <Input
                id="code"
                type="text"
                placeholder="Enter backup code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                disabled={loading}
                autoComplete="off"
              />
            ) : (
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                disabled={loading}
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
              />
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Verifying..." : "Verify"}
          </Button>
          <button
            type="button"
            onClick={handleToggleMode}
            className="text-sm text-muted-foreground underline"
            disabled={loading}
          >
            {useBackupCode ? "Use authenticator app instead" : "Use a backup code"}
          </button>
        </CardFooter>
      </form>
    </Card>
  );
}
