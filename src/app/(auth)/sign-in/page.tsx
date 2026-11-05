import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isSecondFactorPending } from "@/lib/auth/server";
import { sanitizeRedirect } from "@/lib/utils";
import { getEnabledProviders } from "@/lib/auth/providers";
import { isSignupOpen } from "@/lib/auth/signup";
import { LegalFooter } from "../legal-footer";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  // Signed in but the second factor is still owed: finish that instead of signing in again.
  if (await isSecondFactorPending()) {
    const { redirect: target } = await searchParams;
    redirect(target ? `/verify-2fa?redirect=${encodeURIComponent(sanitizeRedirect(target))}` : "/verify-2fa");
  }
  const providers = getEnabledProviders();
  const signupOpen = await isSignupOpen();
  return (
    <>
      <Suspense>
        <SignInForm providers={providers} signupOpen={signupOpen} />
      </Suspense>
      <LegalFooter />
    </>
  );
}
