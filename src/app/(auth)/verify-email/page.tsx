"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { VerificationSentCard } from "../verification-sent-card";

export default function VerifyEmailPage() {
  const email = useSyncExternalStore(
    () => () => {},
    () => sessionStorage.getItem("verify-email"),
    () => null,
  );

  if (email) {
    return <VerificationSentCard email={email} />;
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <Image src="/logo.svg" alt="Alphorn" width={48} height={48} className="mx-auto mb-2" />
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
        <CardDescription>
          We sent a verification link to your email address. Click the link to
          activate your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <Link href="/sign-in" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
