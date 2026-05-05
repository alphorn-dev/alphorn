"use server";

import { prisma } from "@/lib/db";
import { requireAdminOrOwner } from "@/lib/auth/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";

const INVITABLE_ROLES = ["member", "admin"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

function assertInvitableRole(role: string): asserts role is InvitableRole {
  if (!(INVITABLE_ROLES as readonly string[]).includes(role)) {
    throw new Error("Invalid role");
  }
}

export async function getMembers() {
  const { orgId } = await requireAdminOrOwner();

  return prisma.member.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getInvitations() {
  const { orgId } = await requireAdminOrOwner();

  return prisma.invitation.findMany({
    where: {
      organizationId: orgId,
      status: "pending",
      NOT: { email: { startsWith: "invite-link-" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function inviteMember(email: string, role: string) {
  assertInvitableRole(role);

  const { orgId } = await requireAdminOrOwner();

  await auth.api.createInvitation({
    headers: await headers(),
    body: {
      organizationId: orgId,
      email,
      role,
    },
  });

  revalidatePath("/settings");
}

export async function removeMember(memberId: string) {
  const { orgId } = await requireAdminOrOwner();

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId: orgId },
  });
  if (!member) throw new Error("Member not found");

  if (member.role === "owner") {
    const ownerCount = await prisma.member.count({
      where: { organizationId: orgId, role: "owner" },
    });
    if (ownerCount <= 1) {
      throw new Error("Cannot remove the last owner");
    }
  }

  await auth.api.removeMember({
    headers: await headers(),
    body: {
      organizationId: orgId,
      memberIdOrEmail: memberId,
    },
  });

  revalidatePath("/settings");
}

export async function cancelInvitation(invitationId: string) {
  const { orgId } = await requireAdminOrOwner();

  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: orgId },
    select: { id: true },
  });
  if (!invitation) throw new Error("Invitation not found");

  await auth.api.cancelInvitation({
    headers: await headers(),
    body: { invitationId },
  });

  revalidatePath("/settings");
}

export async function getInviteLinks() {
  const { orgId } = await requireAdminOrOwner();

  return prisma.inviteLink.findMany({
    where: { organizationId: orgId },
    include: {
      usedByUser: { select: { name: true, email: true } },
      createdByUser: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createInviteLink(role: string) {
  assertInvitableRole(role);

  const { session, orgId } = await requireAdminOrOwner();

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.inviteLink.create({
    data: {
      token,
      organizationId: orgId,
      role,
      expiresAt,
      createdByUserId: session.user.id,
    },
  });

  revalidatePath("/settings");

  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  return `${baseUrl}/invite/${token}`;
}

export async function updateMemberRole(memberId: string, role: string) {
  assertInvitableRole(role);

  const { orgId } = await requireAdminOrOwner();

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId: orgId },
  });
  if (!member) throw new Error("Member not found");

  if (member.role === "owner") {
    throw new Error("Cannot change the role of an owner — use transfer ownership instead");
  }

  await auth.api.updateMemberRole({
    headers: await headers(),
    body: {
      organizationId: orgId,
      memberId,
      role,
    },
  });

  revalidatePath("/settings");
}

export async function transferOwnership(memberId: string) {
  const { session, orgId, role } = await requireAdminOrOwner();
  if (role !== "owner") {
    throw new Error("Only owners can transfer ownership");
  }

  const callerMember = await prisma.member.findFirst({
    where: { organizationId: orgId, userId: session.user.id },
    select: { id: true },
  });
  if (!callerMember) throw new Error("Permission denied");

  const targetMember = await prisma.member.findFirst({
    where: { id: memberId, organizationId: orgId },
  });
  if (!targetMember) throw new Error("Member not found");

  if (targetMember.userId === session.user.id) {
    throw new Error("Cannot transfer ownership to yourself");
  }

  await auth.api.updateMemberRole({
    headers: await headers(),
    body: {
      organizationId: orgId,
      memberId,
      role: "owner",
    },
  });

  await auth.api.updateMemberRole({
    headers: await headers(),
    body: {
      organizationId: orgId,
      memberId: callerMember.id,
      role: "admin",
    },
  });

  revalidatePath("/settings");
}

export async function revokeInviteLink(id: string) {
  const { orgId } = await requireAdminOrOwner();

  const link = await prisma.inviteLink.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!link) throw new Error("Invite link not found");

  await prisma.inviteLink.delete({ where: { id } });
  revalidatePath("/settings");
}
