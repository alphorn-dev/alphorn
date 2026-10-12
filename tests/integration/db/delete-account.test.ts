import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/server", () => ({
  requireSession: async () => ({ user: { id: auth.userId } }),
}));

import { deleteAccount } from "@/app/(dashboard)/profile/actions";

async function createUser() {
  const id = `usr_${nanoid(10)}`;
  await prisma.user.create({ data: { id, email: `${id}@example.com`, name: "U" } });
  return id;
}

async function createOrg(name: string, members: [string, string][]) {
  const id = `org_${nanoid(10)}`;
  await prisma.organization.create({ data: { id, name } });
  for (const [userId, role] of members) {
    await prisma.member.create({ data: { id: `mem_${nanoid(10)}`, organizationId: id, userId, role } });
  }
  return id;
}

describe("deleteAccount", () => {
  it("refuses while the user is the only owner of a shared project", async () => {
    const owner = await createUser();
    const other = await createUser();
    await createOrg("Shared Project", [[owner, "owner"], [other, "member"]]);
    auth.userId = owner;

    await expect(deleteAccount()).rejects.toThrow(
      "Transfer ownership of Shared Project before deleting your account.",
    );
    expect(await prisma.user.findUnique({ where: { id: owner } })).not.toBeNull();
  });

  it("still deletes sole-member projects and projects with another owner", async () => {
    const owner = await createUser();
    const coOwner = await createUser();
    const solo = await createOrg("Solo", [[owner, "owner"]]);
    const shared = await createOrg("Co-owned", [[owner, "owner"], [coOwner, "owner"]]);
    auth.userId = owner;

    await deleteAccount();

    expect(await prisma.user.findUnique({ where: { id: owner } })).toBeNull();
    expect(await prisma.organization.findUnique({ where: { id: solo } })).toBeNull();
    expect(await prisma.organization.findUnique({ where: { id: shared } })).not.toBeNull();
  });
});
