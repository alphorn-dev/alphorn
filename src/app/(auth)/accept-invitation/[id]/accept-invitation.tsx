"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";

export function AcceptInvitation({
  invitationId,
  organizationName,
  role,
}: {
  invitationId: string;
  organizationName: string;
  role: string;
}) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    setAccepting(true);
    try {
      await acceptInvitation(invitationId);
      toast.success(`Joined ${organizationName}`);
      router.push("/");
    } catch (err) {
      showError(err, "Failed to join");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Card className="text-center">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          You&apos;re invited
        </CardTitle>
        <CardDescription>
          You&apos;ve been invited to join <strong>{organizationName}</strong> as
          a <strong>{role}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Accepting this invitation will give you access to the project&apos;s
          webhooks, channels, and messages.
        </p>
      </CardContent>
      <CardFooter className="justify-center gap-3">
        <Button onClick={handleAccept} disabled={accepting}>
          {accepting ? "Joining..." : "Accept invitation"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/")}>
          Decline
        </Button>
      </CardFooter>
    </Card>
  );
}
