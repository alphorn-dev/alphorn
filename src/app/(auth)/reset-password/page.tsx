"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <Image src="/logo.svg" alt="Alphorn" width={48} height={48} className="mx-auto mb-2" />
          <CardTitle className="text-2xl font-bold">Invalid link</CardTitle>
          <CardDescription>This password reset link is invalid or has expired.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/forgot-password" className="text-sm text-primary underline">Request a new link</Link>
        </CardFooter>
      </Card>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token: token!,
      });
      if (error) {
        showError(error, "Failed to reset password");
        return;
      }
      toast.success("Password reset successfully");
      router.push("/sign-in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <Image src="/logo.svg" alt="Alphorn" width={48} height={48} className="mx-auto mb-2" />
        <CardTitle className="text-2xl font-bold">Reset password</CardTitle>
        <CardDescription>Enter your new password below.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input id="confirm-password" type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} disabled={loading} />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Resetting..." : "Reset password"}</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
