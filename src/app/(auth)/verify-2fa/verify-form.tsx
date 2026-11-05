"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Fingerprint } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { showError } from "@/lib/toast-error";

/** Prove the second factor: passkey, authenticator code, or a backup code. */
export function VerifyForm({
  passkey,
  totp,
  redirectTo,
}: {
  passkey: boolean;
  totp: boolean;
  redirectTo: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function run(fn: () => Promise<{ error: unknown } | null | undefined>) {
    setLoading(true);
    const res = await fn();
    if (res?.error) {
      showError(res.error, "Verification failed");
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <Image src="/logo.svg" alt="Alphorn" width={48} height={48} className="mx-auto mb-2" />
        <CardTitle className="text-2xl font-bold">Confirm it&apos;s you</CardTitle>
        <CardDescription>
          Your account has a second sign-in step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {passkey && (
          <Button
            type="button"
            className="w-full"
            variant={totp ? "outline" : "default"}
            disabled={loading}
            onClick={() => run(() => authClient.signIn.passkey())}
          >
            <Fingerprint className="size-4" />
            Use your passkey
          </Button>
        )}
        {passkey && totp && (
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
        )}
        {totp && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                mode === "totp"
                  ? authClient.twoFactor.verifyTotp({ code })
                  : authClient.twoFactor.verifyBackupCode({ code }),
              );
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="code">
                {mode === "totp" ? "Code from your authenticator app" : "One of your backup codes"}
              </Label>
              {mode === "totp" ? (
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus={!passkey}
                  disabled={loading}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              ) : (
                <Input
                  id="code"
                  autoComplete="off"
                  required
                  autoFocus
                  disabled={loading}
                  value={code}
                  onChange={(e) => setCode(e.target.value.trim())}
                />
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying..." : "Verify"}
            </Button>
            <button
              type="button"
              className="w-full cursor-pointer text-sm text-muted-foreground underline"
              disabled={loading}
              onClick={() => {
                setMode(mode === "totp" ? "backup" : "totp");
                setCode("");
              }}
            >
              {mode === "totp" ? "Lost your phone? Use a backup code" : "Use the authenticator app"}
            </button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center text-xs text-muted-foreground">
        <button
          type="button"
          className="cursor-pointer underline hover:text-foreground"
          onClick={() => authClient.signOut().then(() => router.push("/sign-in"))}
        >
          Sign out
        </button>
      </CardFooter>
    </Card>
  );
}
