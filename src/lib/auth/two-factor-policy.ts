import { factorState } from "./second-factor-hooks";
import { secondFactorProven } from "./second-factor";

/** Provider id of the operator-configured OIDC IdP, or null when none is configured. */
export function oidcProviderId(): string | null {
  return process.env.OIDC_CLIENT_ID ? process.env.OIDC_PROVIDER_ID || "custom-oidc" : null;
}

/**
 * A session satisfies a project's 2FA requirement if it proved a second factor (passkey or
 * authenticator app) the user still has, OR it was created by a sign-in through the
 * operator-configured OIDC IdP (we assume that IdP enforces MFA upstream). Social sign-ins
 * (GitHub, Google, Microsoft) don't count: anyone can hold such an account without MFA. Merely
 * having a linked SSO account is not enough either: a password session of that user never went
 * through the IdP. A user who has a factor can't hold an unproven session anyway: it stays
 * pending until proven (./second-factor.ts).
 */
export async function sessionSatisfies2FA(s: {
  user: { id: string };
  // Index signature: Better Auth's untyped ctx session (Record<string, any>) must fit too.
  session: Record<string, unknown> & {
    secondFactorAt?: Date | null;
    ssoSignInAt?: Date | null;
    ssoProviderId?: string | null;
  };
}): Promise<boolean> {
  const oidc = oidcProviderId();
  if (s.session.ssoSignInAt && oidc && s.session.ssoProviderId === oidc) return true;
  return secondFactorProven(await factorState(s.user.id), s.session.secondFactorAt ?? null);
}
