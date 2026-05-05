"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
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

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
      if (error) {
        showError(error, "Failed to send reset email");
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Card>
        <CardHeader className="text-center">
          <Image
            src="/logo.svg"
            alt="Alphorn"
            width={48}
            height={48}
            className="mx-auto mb-2"
          />
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            If an account exists for {email}, we sent a password reset link.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/sign-in" className="text-sm text-primary underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <Image
          src="/logo.svg"
          alt="Alphorn"
          width={48}
          height={48}
          className="mx-auto mb-2"
        />
        <CardTitle className="text-2xl font-bold">Forgot password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>
          <Link
            href="/sign-in"
            className="text-sm text-muted-foreground underline"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
