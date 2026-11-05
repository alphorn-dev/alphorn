import { factorState } from "./second-factor-hooks";
import { secondFactorProven } from "./second-factor";

/**
 * A session satisfies a project's 2FA requirement if it proved a second factor (passkey or
 * authenticator app) the user still has, OR the session itself was created by an SSO sign-in
 * (`ssoSignInAt`; we assume the IdP enforces MFA upstream). Merely having a linked SSO account
 * is not enough: a password session of that user never went through the IdP. A user who has a
 * factor can't hold an unproven session anyway: it stays pending until proven
 * (./second-factor.ts).
 */
export async function sessionSatisfies2FA(s: {
  user: { id: string };
  // Index signature: Better Auth's untyped ctx session (Record<string, any>) must fit too.
  session: Record<string, unknown> & { secondFactorAt?: Date | null; ssoSignInAt?: Date | null };
}): Promise<boolean> {
  if (s.session.ssoSignInAt) return true;
  return secondFactorProven(await factorState(s.user.id), s.session.secondFactorAt ?? null);
}
