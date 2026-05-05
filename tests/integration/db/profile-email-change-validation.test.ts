import { describe, expect, it, beforeEach } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateEmailChangeRequest } from "@/app/(dashboard)/profile/email-change-validation";

async function createCredentialUser(email: string, password: string): Promise<{ userId: string }> {
  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Test User" },
    asResponse: false,
  });
  // signUpEmail returns { token, user } shape — pull the id from the user.
  const userId = (result as { user: { id: string } }).user.id;
  return { userId };
}

async function createSsoOnlyUser(email: string): Promise<{ userId: string }> {
  // Create a user without a credential account by inserting directly.
  const user = await prisma.user.create({
    data: {
      id: `usr_${Math.random().toString(36).slice(2, 12)}`,
      email,
      name: "SSO User",
      emailVerified: true,
    },
  });
  await prisma.account.create({
    data: {
      id: `acc_${Math.random().toString(36).slice(2, 12)}`,
      userId: user.id,
      providerId: "github",
      accountId: `gh_${user.id}`,
    },
  });
  return { userId: user.id };
}

describe("validateEmailChangeRequest", () => {
  beforeEach(async () => {
    // setup.ts already truncates User between tests, but leave this comment as
    // a reminder that fixtures must be created per test.
  });

  it("returns ok for a valid password + new unique email", async () => {
    const { userId } = await createCredentialUser("alice@example.com", "password123!");
    const result = await validateEmailChangeRequest(userId, "alice@example.com", "password123!", "alice2@example.com");
    expect(result).toEqual({ ok: true });
  });

  it("rejects an incorrect password", async () => {
    const { userId } = await createCredentialUser("bob@example.com", "password123!");
    const result = await validateEmailChangeRequest(userId, "bob@example.com", "wrong-password", "bob2@example.com");
    expect(result).toEqual({ ok: false, reason: "invalid_password" });
  });

  it("rejects when the new email equals the current email (case-insensitive)", async () => {
    const { userId } = await createCredentialUser("carol@example.com", "password123!");
    const result = await validateEmailChangeRequest(userId, "carol@example.com", "password123!", "Carol@example.com");
    expect(result).toEqual({ ok: false, reason: "same_email" });
  });

  it("rejects when the new email is already taken by another user", async () => {
    const { userId } = await createCredentialUser("dave@example.com", "password123!");
    await createCredentialUser("eve@example.com", "password123!");
    const result = await validateEmailChangeRequest(userId, "dave@example.com", "password123!", "eve@example.com");
    expect(result).toEqual({ ok: false, reason: "email_taken" });
  });

  it("rejects when the user has no credential account (SSO-only)", async () => {
    const { userId } = await createSsoOnlyUser("frank@example.com");
    const result = await validateEmailChangeRequest(userId, "frank@example.com", "anything", "frank2@example.com");
    expect(result).toEqual({ ok: false, reason: "no_password" });
  });
});
