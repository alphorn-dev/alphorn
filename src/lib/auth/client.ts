import { createAuthClient } from "better-auth/react";
import {
  genericOAuthClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    genericOAuthClient(),
    organizationClient(),
    twoFactorClient({
      twoFactorPage: "/verify-2fa",
    }),
  ],
});

export const { signOut, useSession, twoFactor } = authClient;
