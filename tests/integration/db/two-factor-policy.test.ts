import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sessionSatisfies2FA } from "@/lib/auth/two-factor-policy";

async function createUser(opts: { passkey?: boolean; totp?: boolean; sso?: boolean } = {}) {
  const id = `usr_${nanoid(10)}`;
  await prisma.user.create({
    data: { id, email: `${id}@example.com`, name: "U", twoFactorEnabled: !!opts.totp },
  });
  await prisma.account.create({
    data: { id: `acc_${nanoid(10)}`, accountId: id, providerId: "credential", userId: id, password: "x" },
  });
  if (opts.passkey) {
    await prisma.passkey.create({
      data: {
        id: `pk_${nanoid(10)}`, userId: id, publicKey: "k", credentialID: nanoid(),
        counter: 0, deviceType: "singleDevice", backedUp: false,
      },
    });
  }
  if (opts.sso) {
    await prisma.account.create({
      data: { id: `acc_${nanoid(10)}`, accountId: nanoid(), providerId: "github", userId: id },
    });
  }
  return id;
}

const check = (id: string, secondFactorAt: Date | null, ssoSignInAt: Date | null = null) =>
  sessionSatisfies2FA({ user: { id }, session: { secondFactorAt, ssoSignInAt } });

describe("sessionSatisfies2FA", () => {
  it("needs a factor proven by this session", async () => {
    const pk = await createUser({ passkey: true });
    expect(await check(pk, null)).toBe(false);
    expect(await check(pk, new Date())).toBe(true);

    const totp = await createUser({ totp: true });
    expect(await check(totp, null)).toBe(false);
    expect(await check(totp, new Date())).toBe(true);
  });

  it("does not count a proof once the factor is gone", async () => {
    const id = await createUser();
    expect(await check(id, new Date())).toBe(false);
  });

  it("trusts sessions created by an SSO sign-in", async () => {
    expect(await check(await createUser({ sso: true }), null, new Date())).toBe(true);
  });

  it("does not trust a password session just because the user has linked SSO", async () => {
    expect(await check(await createUser({ sso: true }), null)).toBe(false);
  });
});

describe("reserveCodeAttempt", () => {
  it("locks the code check after MAX_FAILED_CODES attempts in a row, and only then", async () => {
    const { reserveCodeAttempt } = await import("@/lib/auth/second-factor-hooks");
    const { MAX_FAILED_CODES } = await import("@/lib/auth/second-factor");
    const id = await createUser({ totp: true });
    await prisma.twoFactor.create({ data: { id: `tf_${nanoid(10)}`, userId: id, secret: "s", backupCodes: "b" } });

    for (let i = 0; i < MAX_FAILED_CODES; i++) await reserveCodeAttempt(id);
    await expect(reserveCodeAttempt(id)).rejects.toThrow("Too many wrong codes");
    const row = await prisma.twoFactor.findFirstOrThrow({ where: { userId: id } });
    expect(row.lockedUntil).not.toBeNull();
    await expect(reserveCodeAttempt(id)).rejects.toThrow("Too many wrong codes");

    // An expired lock starts a fresh count.
    await prisma.twoFactor.updateMany({ where: { userId: id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await reserveCodeAttempt(id);
    expect((await prisma.twoFactor.findFirstOrThrow({ where: { userId: id } })).failedVerificationCount).toBe(1);
  });

  it("is a no-op for users without an authenticator app", async () => {
    const { reserveCodeAttempt } = await import("@/lib/auth/second-factor-hooks");
    await expect(reserveCodeAttempt(await createUser())).resolves.toBeUndefined();
  });
});
