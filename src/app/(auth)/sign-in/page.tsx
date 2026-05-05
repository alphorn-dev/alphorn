import { Suspense } from "react";
import { getEnabledProviders } from "@/lib/auth/providers";
import { LegalFooter } from "../legal-footer";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const providers = getEnabledProviders();
  return (
    <>
      <Suspense>
        <SignInForm providers={providers} />
      </Suspense>
      <LegalFooter />
    </>
  );
}
