"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { showError } from "@/lib/toast-error";

const RESEND_COOLDOWN_SECONDS = 60;

export function VerificationSentCard({
  email,
  redirectTo,
  onBack,
}: {
  email: string;
  redirectTo?: string | null;
  onBack?: () => void;
}) {
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: redirectTo || "/",
    });
    setResending(false);
    if (error) {
      showError(error, "Failed to resend verification email");
      return;
    }
    toast.success("Verification email sent");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  const signInHref = redirectTo
    ? `/sign-in?redirect=${encodeURIComponent(redirectTo)}`
    : "/sign-in";

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="size-6 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">Verify your email</CardTitle>
        <CardDescription>
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{email}</span>. Click
          the link to activate your account.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-col gap-3">
        <Button
          className="w-full"
          onClick={handleResend}
          disabled={resending || cooldown > 0}
        >
          {resending
            ? "Sending..."
            : cooldown > 0
              ? `Resend in ${cooldown}s`
              : "Resend verification email"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t receive the email? Check your spam folder.
        </p>
        <p className="text-sm text-muted-foreground">
          Already verified?{" "}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-primary underline"
            >
              Sign in
            </button>
          ) : (
            <Link href={signInHref} className="text-primary underline">
              Sign in
            </Link>
          )}
        </p>
      </CardFooter>
    </Card>
  );
}
