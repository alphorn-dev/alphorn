import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type EmailChangeValidationResult =
  | { ok: true }
  | { ok: false; reason: "no_password" }
  | { ok: false; reason: "invalid_password" }
  | { ok: false; reason: "same_email" }
  | { ok: false; reason: "email_taken" };

export async function validateEmailChangeRequest(
  userId: string,
  currentEmail: string,
  currentPassword: string,
  newEmail: string,
): Promise<EmailChangeValidationResult> {
  const normalized = newEmail.trim().toLowerCase();

  if (normalized === currentEmail.trim().toLowerCase()) {
    return { ok: false, reason: "same_email" };
  }

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { password: true },
  });
  if (!account?.password) {
    return { ok: false, reason: "no_password" };
  }

  const ctx = await auth.$context;
  const passwordOk = await ctx.password.verify({
    hash: account.password,
    password: currentPassword,
  });
  if (!passwordOk) {
    return { ok: false, reason: "invalid_password" };
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  if (existing && existing.id !== userId) {
    return { ok: false, reason: "email_taken" };
  }

  return { ok: true };
}
