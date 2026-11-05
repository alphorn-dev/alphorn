import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    twoFactorClient({
      twoFactorPage: "/verify-2fa",
    }),
    passkeyClient(),
  ],
});

export const { signOut, useSession, twoFactor } = authClient;
