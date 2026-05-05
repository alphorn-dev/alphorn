import { isMailerConfigured } from "@/lib/email/mailer";
import { ForgotPasswordForm } from "./form";
import Image from "next/image";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  if (!isMailerConfigured()) {
    return (
      <Card>
        <CardHeader className="text-center">
          <Image
            src="/logo.svg"
            alt="Alphorn"
            width={48}
            height={48}
            className="mx-auto mb-2"
          />
          <CardTitle className="text-2xl font-bold">
            Password reset unavailable
          </CardTitle>
          <CardDescription>
            Email sending is not configured on this instance. Contact your
            administrator to reset your password.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/sign-in" className="text-sm text-primary underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return <ForgotPasswordForm />;
}
