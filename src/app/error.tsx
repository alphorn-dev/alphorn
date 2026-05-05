"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md px-4 text-center">
        <Image
          src="/logo.svg"
          alt="Alphorn"
          width={48}
          height={48}
          className="mx-auto mb-6"
        />
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button onClick={() => unstable_retry()}>Try again</Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
