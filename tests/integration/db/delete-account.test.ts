import { nanoid } from "nanoid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const auth = vi.hoisted(() => ({
  userId: "",
  hasPassword: false,
  secondFactorAt: null as Date | null,
  headers: new Headers(),
}));
vi.mock("next/headers", () => ({ headers: async () => auth.headers }));
vi.mock("@/lib/auth/server", () => ({
  requireSession: async () => ({
    user: { id: auth.userId },
    session: { id: "s", secondFactorAt: auth.secondFactorAt },
  }),
  currentUserHasPassword: async () => auth.hasPassword,
}));

import { auth as betterAuth } from "@/lib/auth";
import { deleteAccount } from "@/app/(dashboard)/profile/actions";

beforeEach(() => {
  auth.hasPassword = false;
  auth.secondFactorAt = null;
  auth.headers = new Headers();
});

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

    expect(await deleteAccount()).toEqual({ ok: true });

    expect(await prisma.user.findUnique({ where: { id: owner } })).toBeNull();
    expect(await prisma.organization.findUnique({ where: { id: solo } })).toBeNull();
    expect(await prisma.organization.findUnique({ where: { id: shared } })).not.toBeNull();
  });
});

describe("deleteAccount re-authentication", () => {
  const PASSWORD = "correct-horse-battery-1";

  async function passwordUser() {
    const { headers, response } = await betterAuth.api.signUpEmail({
      body: { email: `u_${nanoid(8).toLowerCase()}@example.com`, password: PASSWORD, name: "U" },
      returnHeaders: true,
    });
    auth.headers = new Headers({
      cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
    });
    auth.userId = response.user.id;
    auth.hasPassword = true;
    return response.user.id;
  }

  async function addTotp(userId: string) {
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    await prisma.twoFactor.create({
      data: { id: nanoid(), userId, secret: "s", backupCodes: "b", verified: true },
    });
    // Proven at sign-in long ago: the session isn't pending, but the proof isn't recent.
    await prisma.session.updateMany({ where: { userId }, data: { secondFactorAt: new Date(0) } });
  }

  it("needs the password of a password user", async () => {
    const id = await passwordUser();
    expect(await deleteAccount("wrong-password")).toEqual({ ok: false, reason: "invalid_password" });
    expect(await deleteAccount()).toEqual({ ok: false, reason: "invalid_password" });
    expect(await prisma.user.findUnique({ where: { id } })).not.toBeNull();

    expect(await deleteAccount(PASSWORD)).toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });

  it("needs a second factor proven within the last minutes when the user has one", async () => {
    const id = await passwordUser();
    await addTotp(id);

    expect(await deleteAccount(PASSWORD)).toEqual({ ok: false, reason: "second_factor_required" });
    auth.secondFactorAt = new Date(Date.now() - 10 * 60_000);
    expect(await deleteAccount(PASSWORD)).toEqual({ ok: false, reason: "second_factor_required" });
    expect(await prisma.user.findUnique({ where: { id } })).not.toBeNull();

    auth.secondFactorAt = new Date();
    expect(await deleteAccount(PASSWORD)).toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });

  it("needs nothing extra for an SSO-only user without a second factor", async () => {
    const id = await createUser();
    auth.userId = id;
    expect(await deleteAccount()).toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });
});
