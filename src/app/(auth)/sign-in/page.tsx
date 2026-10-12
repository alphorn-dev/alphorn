import { Suspense } from "react";
import { getEnabledProviders } from "@/lib/auth/providers";
import { isSignupOpen } from "@/lib/auth/signup";
import { LegalFooter } from "../legal-footer";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
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
