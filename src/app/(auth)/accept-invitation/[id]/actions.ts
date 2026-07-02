"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth/server";

export async function acceptInvitation(invitationId: string) {
  await requireSession();

  const result = await auth.api.acceptInvitation({
    headers: await headers(),
    body: { invitationId },
  });

  const organizationId = result?.member?.organizationId;
  if (organizationId) {
    await auth.api.setActiveOrganization({
      headers: await headers(),
      body: { organizationId },
    });
  }
}
