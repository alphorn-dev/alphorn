import { redirect } from "next/navigation";
import { factorState } from "@/lib/auth/second-factor-hooks";
import { getRawSession, getSession, isSecondFactorPending } from "@/lib/auth/server";
import { sanitizeRedirect } from "@/lib/utils";
import { VerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";

// Second step of a sign-in (./second-factor.ts). Two ways to get here:
// - a password sign-in by a TOTP user: Better Auth holds the sign-in back (no session yet)
//   until the code is verified;
// - any other sign-in (password with passkeys only, SSO) by a user with a factor: the
//   session exists but is pending until a factor is proven.
export default async function Verify2FAPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: target } = await searchParams;
  const redirectTo = target ? sanitizeRedirect(target) : "/";

  if (await getSession()) redirect(redirectTo);

  if (await isSecondFactorPending()) {
    const session = (await getRawSession())!;
    const factors = await factorState(session.user.id);
    return (
      <VerifyForm
        passkey={factors.passkeys > 0}
        totp={factors.twoFactorEnabled}
        redirectTo={redirectTo}
      />
    );
  }

  // No session: Better Auth's TOTP sign-in challenge. The user may have passkeys too; a
  // passkey sign-in replaces the challenge.
  return <VerifyForm passkey totp redirectTo={redirectTo} />;
}
