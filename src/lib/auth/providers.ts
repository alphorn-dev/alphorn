export type EnabledProvider = {
  id: string;
  name: string;
  type: "social" | "oidc";
};

/**
 * Returns which auth providers are enabled based on environment variables.
 * Called server-side and passed to client components as props.
 */
export function getEnabledProviders(): EnabledProvider[] {
  const providers: EnabledProvider[] = [];

  if (process.env.GITHUB_CLIENT_ID) {
    providers.push({ id: "github", name: "GitHub", type: "social" });
  }
  if (process.env.GOOGLE_CLIENT_ID) {
    providers.push({ id: "google", name: "Google", type: "social" });
  }
  if (process.env.MICROSOFT_CLIENT_ID) {
    providers.push({ id: "microsoft-entra-id", name: "Microsoft", type: "oidc" });
  }
  if (process.env.OIDC_CLIENT_ID) {
    providers.push({
      id: process.env.OIDC_PROVIDER_ID || "custom-oidc",
      name: process.env.OIDC_PROVIDER_NAME || "SSO",
      type: "oidc",
    });
  }

  return providers;
}
