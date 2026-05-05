import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export function SsoSecuritySection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Two-Factor Authentication</CardTitle>
            <CardDescription className="mt-1">
              Your account signs in through a single sign-on provider.
            </CardDescription>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3 w-3" />
            Managed by provider
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Multi-factor authentication is enforced by your identity provider
          (Google, Microsoft, or SSO). You do not need to configure a separate
          authenticator app here. Enable MFA in your provider&apos;s account
          settings for the strongest protection.
        </p>
      </CardContent>
    </Card>
  );
}
