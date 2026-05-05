import { isHostedAlphorn } from "@/lib/is-hosted";

export async function LegalFooter() {
  if (!(await isHostedAlphorn())) return null;
  return (
    <p className="mt-6 text-center text-xs text-muted-foreground">
      By continuing, you agree to our{" "}
      <a
        href="https://alphorn.dev/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        Terms
      </a>{" "}
      and{" "}
      <a
        href="https://alphorn.dev/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}
