import { Suspense } from "react";
import { getEnabledProviders } from "@/lib/auth/providers";
import { isSignupOpen } from "@/lib/auth/signup";
import { LegalFooter } from "../legal-footer";
import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const providers = getEnabledProviders();
  const signupOpen = await isSignupOpen();
  return (
    <>
      <Suspense>
        <SignUpForm providers={providers} signupOpen={signupOpen} />
      </Suspense>
      <LegalFooter />
    </>
  );
}
