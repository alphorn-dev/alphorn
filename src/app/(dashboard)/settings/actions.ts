"use server";

import { prisma } from "@/lib/db";
import {
  requireSession,
  requireOrgSession,
  requireAdminOrOwner,
  currentUserOrgs2FAGap,
  currentUserSatisfies2FA,
} from "@/lib/auth/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

export async function getOrgSettings() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;

  return prisma.organizationSettings.findUnique({
    where: { organizationId: orgId },
  });
}

export async function updateOrgSettings(data: {
  failureNotificationChannelId: string | null;
}) {
  const { orgId } = await requireAdminOrOwner();

  if (data.failureNotificationChannelId) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: data.failureNotificationChannelId,
        organizationId: orgId,
      },
      select: { id: true },
    });
    if (!channel) throw new Error("Channel not found");
  }

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      failureNotificationChannelId: data.failureNotificationChannelId,
    },
    update: {
      failureNotificationChannelId: data.failureNotificationChannelId,
    },
  });

  revalidatePath("/settings");
}

export async function getOrgSecuritySettings() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;

  return prisma.organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { requireTwoFactor: true },
  });
}

export async function getProjectName() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  return org?.name ?? null;
}

export async function updateProjectName(name: string) {
  const { orgId } = await requireAdminOrOwner();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name cannot be empty");
  if (trimmed.length > 100) throw new Error("Project name is too long");

  await prisma.organization.update({
    where: { id: orgId },
    data: { name: trimmed },
  });

  revalidatePath("/settings");
}

export async function getOrgs2FARequirements(): Promise<string[]> {
  await requireSession();
  return currentUserOrgs2FAGap();
}

export async function deleteProject() {
  const { session, orgId } = await requireOrgSession();

  const member = await prisma.member.findFirst({
    where: { organizationId: orgId, userId: session.user.id },
    select: { role: true },
  });
  if (member?.role !== "owner") {
    throw new Error("Only the owner can delete this project");
  }

  const sub = await prisma.subscription.findUnique({
    where: { organizationId: orgId },
    select: { paddleSubscriptionId: true, plan: true, status: true },
  });
  if (
    sub?.paddleSubscriptionId &&
    sub.plan !== "free" &&
    sub.status !== "cancelled"
  ) {
    throw new Error(
      "Cancel your subscription in Billing before deleting this project.",
    );
  }

  await prisma.organization.delete({ where: { id: orgId } });

  // Session.activeOrganizationId has no FK to Organization, so deletion leaves
  // a dangling reference. Point the session at another org the user belongs
  // to, or clear it so the dashboard layout can redirect to /new-project.
  const next = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  await auth.api.setActiveOrganization({
    headers: await headers(),
    body: { organizationId: next?.organizationId ?? null },
  });
}

export async function updateRequireTwoFactor(requireTwoFactor: boolean) {
  const { session, orgId } = await requireOrgSession();

  const callerMember = await prisma.member.findFirst({
    where: { organizationId: orgId, userId: session.user.id },
  });
  if (!callerMember || !["owner", "admin"].includes(callerMember.role)) {
    throw new Error("Only owners and admins can change security settings");
  }

  if (requireTwoFactor) {
    const satisfies = await currentUserSatisfies2FA();
    if (!satisfies) {
      throw new Error(
        "Enable 2FA on your own account before requiring it for the organization",
      );
    }
  }

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      requireTwoFactor,
    },
    update: {
      requireTwoFactor,
    },
  });

  revalidatePath("/settings");
}
