import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Member emails and pending invitations are admin-only, also on Better Auth's
// organization API that clients can call directly.
const PASSWORD = "correct-horse-battery-1";

async function signUp() {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email: `u_${nanoid(8).toLowerCase()}@example.com`, password: PASSWORD, name: "U" },
    returnHeaders: true,
  });
  const cookie = new Headers({
    cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
  });
  return { userId: response.user.id, headers: cookie };
}

async function projectWith(role: "member" | "admin") {
  const owner = await signUp();
  const org = await auth.api.createOrganization({
    body: { name: "P", slug: `p-${nanoid(8).toLowerCase()}` },
    headers: owner.headers,
  });
  const user = await signUp();
  await prisma.member.create({
    data: { id: nanoid(), organizationId: org!.id, userId: user.userId, role, createdAt: new Date() },
  });
  await auth.api.setActiveOrganization({ body: { organizationId: org!.id }, headers: user.headers });
  return { orgId: org!.id, headers: user.headers };
}

describe("organization member data", () => {
  it("is refused to plain members on every endpoint that lists it", async () => {
    const { orgId, headers } = await projectWith("member");

    await expect(auth.api.getFullOrganization({ headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(
      auth.api.getFullOrganization({ headers, query: { organizationId: orgId } }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(auth.api.listMembers({ headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(auth.api.listInvitations({ headers })).rejects.toMatchObject({ status: "FORBIDDEN" });

    // What the UI needs still works: own role and the project itself.
    expect(await auth.api.getActiveMemberRole({ headers })).toMatchObject({ role: "member" });
    expect(await auth.api.getOrganization({ headers })).toMatchObject({ id: orgId });
  });

  it("is still available to admins", async () => {
    const { headers } = await projectWith("admin");
    const full = await auth.api.getFullOrganization({ headers });
    expect(full?.members.length).toBe(2);
    expect((await auth.api.listMembers({ headers })).members.length).toBe(2);
  });

  it("can't be reached by mixing a project where the user is admin with one where they're a member", async () => {
    const victim = await projectWith("member"); // user is a plain member here, and it's active
    const user = await auth.api.getSession({ headers: victim.headers });
    const own = await auth.api.createOrganization({
      body: { name: "Mine", slug: `m-${nanoid(8).toLowerCase()}`, keepCurrentActiveOrganization: true },
      headers: victim.headers,
    }); // and owner here
    const victimSlug = (await prisma.organization.findUniqueOrThrow({ where: { id: victim.orgId } })).slug!;
    expect(user!.session.activeOrganizationId).toBe(victim.orgId);

    const attempts = [
      { organizationId: own!.id, organizationSlug: victimSlug }, // endpoint prefers the slug
      { organizationId: "" }, // empty id: endpoint falls back to the active project
      { organizationSlug: victimSlug },
      { organizationSlug: "does-not-exist", organizationId: own!.id },
    ];
    for (const query of attempts) {
      await expect(
        auth.api.getFullOrganization({ headers: victim.headers, query }),
      ).rejects.toMatchObject({ status: "FORBIDDEN" });
      await expect(
        auth.api.listMembers({ headers: victim.headers, query }),
      ).rejects.toMatchObject({ status: "FORBIDDEN" });
    }

    // Their own project stays readable.
    const mine = await auth.api.getFullOrganization({ headers: victim.headers, query: { organizationId: own!.id } });
    expect(mine?.id).toBe(own!.id);
  });
});
