import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { AcceptInvitation } from "./accept-invitation";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true } },
    },
  });

  if (!invitation || invitation.status !== "pending") {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Invalid or used invitation</h1>
        <p className="text-muted-foreground">
          This invitation is no longer valid. It may have been accepted, expired,
          or revoked.
        </p>
        <a href="/sign-in" className="text-primary underline">
          Go to sign in
        </a>
      </div>
    );
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Invitation expired</h1>
        <p className="text-muted-foreground">
          This invitation has expired. Ask the project owner to send a new one.
        </p>
        <a href="/sign-in" className="text-primary underline">
          Go to sign in
        </a>
      </div>
    );
  }

  const session = await getSession();

  if (!session) {
    redirect(`/sign-in?redirect=/accept-invitation/${id}`);
  }

  return (
    <AcceptInvitation
      invitationId={id}
      organizationName={invitation.organization?.name ?? "the project"}
      role={invitation.role ?? "member"}
    />
  );
}
