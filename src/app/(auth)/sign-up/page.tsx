import { Suspense } from "react";
import { getEnabledProviders } from "@/lib/auth/providers";
import { LegalFooter } from "../legal-footer";
import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  const providers = getEnabledProviders();
  return (
    <>
      <Suspense>
        <SignUpForm providers={providers} />
      </Suspense>
      <LegalFooter />
    </>
  );
}
