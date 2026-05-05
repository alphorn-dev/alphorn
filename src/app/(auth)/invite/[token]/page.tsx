import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { AcceptInvite } from "./accept-invite";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const inviteLink = await prisma.inviteLink.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
    },
  });

  if (!inviteLink || inviteLink.usedAt) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Invalid or used invite</h1>
        <p className="text-muted-foreground">
          This invite link is no longer valid. It may have been used, expired, or
          revoked.
        </p>
        <a href="/sign-in" className="text-primary underline">
          Go to sign in
        </a>
      </div>
    );
  }

  if (inviteLink.expiresAt < new Date()) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Invite expired</h1>
        <p className="text-muted-foreground">
          This invite link has expired. Ask the project owner for a new one.
        </p>
        <a href="/sign-in" className="text-primary underline">
          Go to sign in
        </a>
      </div>
    );
  }

  const session = await getSession();

  if (!session) {
    redirect(`/sign-in?redirect=/invite/${token}`);
  }

  return (
    <AcceptInvite
      token={token}
      organizationName={inviteLink.organization.name}
      role={inviteLink.role}
    />
  );
}
