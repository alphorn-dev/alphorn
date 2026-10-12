import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function signUp(email: string) {
  return auth.api.signUpEmail({
    body: { email, password: "password123!", name: email },
    asResponse: true,
  });
}

async function headersFor(res: Response): Promise<Headers> {
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

describe("DISABLE_SIGNUP", () => {
  beforeEach(() => {
    process.env.DISABLE_SIGNUP = "true";
  });
  afterEach(() => {
    delete process.env.DISABLE_SIGNUP;
  });

  it("allows the first account on an empty install, then rejects uninvited sign-ups", async () => {
    expect((await signUp("first@example.com")).status).toBe(200);
    expect((await signUp("stranger@example.com")).status).toBe(403);
    expect(await prisma.user.count()).toBe(1);
  });

  it("allows sign-up for an email with a pending invitation, case-insensitively", async () => {
    const owner = await headersFor(await signUp("owner@example.com"));
    const org = (await auth.api.createOrganization({
      headers: owner,
      body: { name: "Acme", slug: `acme-${nanoid(8)}` },
    })) as { id: string };
    await auth.api.createInvitation({
      headers: owner,
      body: { organizationId: org.id, email: "invitee@example.com", role: "member" },
    });

    expect((await signUp("Invitee@Example.com")).status).toBe(200);
  });

  it("rejects sign-up when the invitation has expired", async () => {
    const owner = await headersFor(await signUp("owner@example.com"));
    const org = (await auth.api.createOrganization({
      headers: owner,
      body: { name: "Acme", slug: `acme-${nanoid(8)}` },
    })) as { id: string };
    const invitation = (await auth.api.createInvitation({
      headers: owner,
      body: { organizationId: org.id, email: "late@example.com", role: "member" },
    })) as { id: string };
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await signUp("late@example.com")).status).toBe(403);
  });

  it("leaves sign-up open when unset", async () => {
    delete process.env.DISABLE_SIGNUP;
    await signUp("first@example.com");
    expect((await signUp("second@example.com")).status).toBe(200);
  });
});
