import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Sign up a credential user and return a Headers object carrying its session
// cookie, so subsequent auth.api calls run as that user. We replay the real
// Set-Cookie from sign-up because Better Auth signs the session cookie.
async function signUp(email: string): Promise<{ userId: string; headers: Headers }> {
  const res = await auth.api.signUpEmail({
    body: { email, password: "password123!", name: email },
    asResponse: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const { user } = (await res.json()) as { user: { id: string } };
  return { userId: user.id, headers: new Headers({ cookie }) };
}

describe("organization invitation acceptance", () => {
  it("lets the invited user accept a pending invitation by id and become a member", async () => {
    const owner = await signUp("owner@example.com");

    const org = (await auth.api.createOrganization({
      headers: owner.headers,
      body: { name: "Acme", slug: `acme-${nanoid(8)}` },
    })) as { id: string };

    const invitation = (await auth.api.createInvitation({
      headers: owner.headers,
      body: { organizationId: org.id, email: "invitee@example.com", role: "admin" },
    })) as { id: string };

    // The emailed link routes to /accept-invitation/{id}; the accept action
    // hands that id straight to Better Auth.
    const invitee = await signUp("invitee@example.com");
    await auth.api.acceptInvitation({
      headers: invitee.headers,
      body: { invitationId: invitation.id },
    });

    const member = await prisma.member.findFirst({
      where: { organizationId: org.id, userId: invitee.userId },
    });
    expect(member?.role).toBe("admin");

    const accepted = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });
    expect(accepted?.status).toBe("accepted");
  });

  it("rejects acceptance by a user whose email does not match the invitation", async () => {
    const owner = await signUp("owner@example.com");

    const org = (await auth.api.createOrganization({
      headers: owner.headers,
      body: { name: "Acme", slug: `acme-${nanoid(8)}` },
    })) as { id: string };

    const invitation = (await auth.api.createInvitation({
      headers: owner.headers,
      body: { organizationId: org.id, email: "invitee@example.com", role: "admin" },
    })) as { id: string };

    const stranger = await signUp("stranger@example.com");
    await expect(
      auth.api.acceptInvitation({
        headers: stranger.headers,
        body: { invitationId: invitation.id },
      }),
    ).rejects.toThrow();

    const member = await prisma.member.findFirst({
      where: { organizationId: org.id, userId: stranger.userId },
    });
    expect(member).toBeNull();
  });
});
