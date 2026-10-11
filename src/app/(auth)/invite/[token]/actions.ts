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

  // A link only carries the authority of whoever created it: once they are
  // no longer an admin or owner of the project, it stops working.
  const creator = await prisma.member.findFirst({
    where: {
      organizationId: inviteLink.organizationId,
      userId: inviteLink.createdByUserId,
      role: { in: ["owner", "admin"] },
    },
    select: { id: true },
  });
  if (!creator) {
    throw new Error("Invite link is no longer valid");
  }

  const existing = await prisma.member.findFirst({
    where: {
      organizationId: inviteLink.organizationId,
      userId: session.user.id,
    },
  });

  await prisma.$transaction(async (tx) => {
    // Claim atomically: two concurrent accepts of the same single-use link
    // both pass the usedAt check above, only one may get through here.
    const claimed = await tx.inviteLink.updateMany({
      where: { id: inviteLink.id, usedAt: null },
      data: { usedAt: new Date(), usedByUserId: session.user.id },
    });
    if (claimed.count === 0) {
      throw new Error("Invalid or already used invite link");
    }
    if (!existing) {
      await tx.member.create({
        data: {
          id: randomBytes(16).toString("hex"),
          organizationId: inviteLink.organizationId,
          userId: session.user.id,
          role: inviteLink.role,
        },
      });
    }
  });

  await auth.api.setActiveOrganization({
    headers: await headers(),
    body: { organizationId: inviteLink.organizationId },
  });
}
