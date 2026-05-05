"use client";

import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
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
        <h1 className="text-7xl font-bold tracking-tight text-foreground">
          404
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Page not found
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-8" })}>
          Go home
        </Link>
      </div>
    </div>
  );
}
