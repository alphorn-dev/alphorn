"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth/server";
import { randomBytes } from "crypto";

export async function acceptInviteLink(token: string) {
  const session = await requireSession();

  const inviteLink = await prisma.inviteLink.findUnique({
    where: { token },
  });

  if (!inviteLink || inviteLink.usedAt) {
    throw new Error("Invalid or already used invite link");
  }
  if (inviteLink.expiresAt < new Date()) {
    throw new Error("Invite link has expired");
  }
  if (!["member", "admin"].includes(inviteLink.role)) {
    throw new Error("Invite link has an invalid role");
  }

  const existing = await prisma.member.findFirst({
    where: {
      organizationId: inviteLink.organizationId,
      userId: session.user.id,
    },
  });

  if (existing) {
    await prisma.inviteLink.update({
      where: { id: inviteLink.id },
      data: { usedAt: new Date(), usedByUserId: session.user.id },
    });
  } else {
    await prisma.$transaction([
      prisma.member.create({
        data: {
          id: randomBytes(16).toString("hex"),
          organizationId: inviteLink.organizationId,
          userId: session.user.id,
          role: inviteLink.role,
        },
      }),
      prisma.inviteLink.update({
        where: { id: inviteLink.id },
        data: { usedAt: new Date(), usedByUserId: session.user.id },
      }),
    ]);
  }

  await auth.api.setActiveOrganization({
    headers: await headers(),
    body: { organizationId: inviteLink.organizationId },
  });
}
