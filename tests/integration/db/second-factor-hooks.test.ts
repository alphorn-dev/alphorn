import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { grantPasskeyReauth, secondFactorAfter } from "@/lib/auth/second-factor-hooks";

// The Better Auth hooks in src/lib/auth/second-factor-hooks.ts, driven through auth.api with
// real session cookies.

const PASSWORD = "correct-horse-battery-1";

const cookieOf = (h: Headers) =>
  new Headers({ cookie: h.getSetCookie().map((c) => c.split(";")[0]).join("; ") });

async function signUp() {
  const email = `u_${nanoid(8).toLowerCase()}@example.com`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "U" },
    returnHeaders: true,
  });
  return { email, userId: response.user.id, headers: cookieOf(headers) };
}

async function signIn(email: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return cookieOf(headers);
}

const addPasskeyRow = (userId: string) =>
  prisma.passkey.create({
    data: {
      id: `pk_${nanoid(10)}`, userId, publicKey: "k", credentialID: nanoid(),
      counter: 0, deviceType: "singleDevice", backedUp: false,
    },
  });

const sessionsOf = (userId: string) =>
  prisma.session.findMany({ where: { userId }, select: { id: true, secondFactorAt: true } });

/** A user with an authenticator app whose only session is pending; returns a backup code. */
async function pendingTotpUser() {
  const u = await signUp();
  const enabled = await auth.api.enableTwoFactor({
    body: { password: PASSWORD, method: "totp" },
    headers: u.headers,
  });
  if (enabled.method !== "totp") throw new Error("expected TOTP");
  // Skip the enrollment code: mark the app confirmed, as verify-totp would.
  await prisma.twoFactor.updateMany({ where: { userId: u.userId }, data: { verified: true } });
  await prisma.user.update({ where: { id: u.userId }, data: { twoFactorEnabled: true } });
  return { ...u, backupCode: enabled.backupCodes[0] };
}

describe("pending session", () => {
  it("may only prove a factor or sign out", async () => {
    const u = await signUp();
    await addPasskeyRow(u.userId); // the session now owes a second factor

    expect(await auth.api.getSession({ headers: u.headers })).not.toBeNull();
    await expect(
      auth.api.disableTwoFactor({ body: { password: PASSWORD }, headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(
      auth.api.generatePasskeyRegistrationOptions({ headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(auth.api.listSessions({ headers: u.headers })).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
  });

  it("is proven by a correct backup code, not by a wrong one", async () => {
    const u = await pendingTotpUser();

    await expect(
      auth.api.verifyBackupCode({ body: { code: "wrong-code" }, headers: u.headers }),
    ).rejects.toBeDefined();
    expect((await sessionsOf(u.userId))[0].secondFactorAt).toBeNull();
    expect(
      (await prisma.twoFactor.findFirstOrThrow({ where: { userId: u.userId } }))
        .failedVerificationCount,
    ).toBe(1);

    await auth.api.verifyBackupCode({ body: { code: u.backupCode }, headers: u.headers });
    expect((await sessionsOf(u.userId))[0].secondFactorAt).not.toBeNull();
    expect(
      (await prisma.twoFactor.findFirstOrThrow({ where: { userId: u.userId } }))
        .failedVerificationCount,
    ).toBe(0);
    // Proven: other routes work again.
    await expect(auth.api.listSessions({ headers: u.headers })).resolves.toBeDefined();
  });

  it("proves the new session of a password + code sign-in", async () => {
    const u = await pendingTotpUser();
    const res = await auth.api.signInEmail({
      body: { email: u.email, password: PASSWORD },
      returnHeaders: true,
    });
    expect(res.response).toMatchObject({ twoFactorRedirect: true });

    await auth.api.verifyBackupCode({
      body: { code: u.backupCode },
      headers: cookieOf(res.headers),
    });
    const sessions = await sessionsOf(u.userId);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.secondFactorAt)).toHaveLength(1);
  });
});

describe("adding a passkey", () => {
  it("needs a recent password confirmation", async () => {
    const u = await signUp();
    await expect(
      auth.api.generatePasskeyRegistrationOptions({ headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });

    const [s] = await sessionsOf(u.userId);
    await grantPasskeyReauth(s.id, u.userId);
    await expect(
      auth.api.generatePasskeyRegistrationOptions({ headers: u.headers }),
    ).resolves.toHaveProperty("challenge");
  });

  it("does not accept another session's confirmation", async () => {
    const u = await signUp();
    const other = await signIn(u.email);
    const [first] = await sessionsOf(u.userId);
    await grantPasskeyReauth(first.id, u.userId);

    const session = await auth.api.getSession({ headers: other });
    expect(session!.session.id).not.toBe(first.id);
    await expect(
      auth.api.generatePasskeyRegistrationOptions({ headers: other }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("cleans up expired confirmations when a new one is recorded", async () => {
    const u = await signUp();
    const [s] = await sessionsOf(u.userId);
    await prisma.verification.create({
      data: {
        id: nanoid(), identifier: "passkey-reauth:gone-session", value: u.userId,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await grantPasskeyReauth(s.id, u.userId);
    await grantPasskeyReauth(s.id, u.userId);

    const rows = await prisma.verification.findMany({
      where: { identifier: { startsWith: "passkey-reauth:" } },
      select: { identifier: true },
    });
    expect(rows).toEqual([{ identifier: `passkey-reauth:${s.id}` }]);
  });

  it("does not accept an expired confirmation", async () => {
    const u = await signUp();
    const [s] = await sessionsOf(u.userId);
    await grantPasskeyReauth(s.id, u.userId);
    await prisma.verification.updateMany({
      where: { identifier: { startsWith: "passkey-reauth:" } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      auth.api.generatePasskeyRegistrationOptions({ headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });
});

/** No password. Signed in seconds ago (fresh createdAt), but not through SSO or a factor. */
async function ssoOnlyUser() {
  const u = await signUp();
  await prisma.account.deleteMany({ where: { userId: u.userId, providerId: "credential" } });
  return u;
}

const setSessionTimes = (userId: string, data: { ssoSignInAt?: Date; secondFactorAt?: Date }) =>
  prisma.session.updateMany({ where: { userId }, data });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

describe("adding a factor without a password (SSO-only)", () => {
  const addPasskey = (h: Headers) => auth.api.generatePasskeyRegistrationOptions({ headers: h });
  const enableTotp = (h: Headers) =>
    auth.api.enableTwoFactor({ body: { method: "totp" }, headers: h });

  it("is refused without a recent SSO sign-in, even on a new session", async () => {
    const u = await ssoOnlyUser();
    await expect(addPasskey(u.headers)).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(enableTotp(u.headers)).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await prisma.twoFactor.count({ where: { userId: u.userId } })).toBe(0);
  });

  it("can't read back the secret of an unfinished setup without a recent sign-in", async () => {
    const u = await ssoOnlyUser();
    await prisma.session.updateMany({
      where: { userId: u.userId },
      data: { ssoSignInAt: new Date() },
    });
    await enableTotp(u.headers); // the owner starts the setup and never enters the code
    await prisma.session.updateMany({
      where: { userId: u.userId },
      data: { ssoSignInAt: new Date(Date.now() - 6 * 60_000) },
    });

    await expect(
      auth.api.getTOTPURI({ body: {}, headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("treats a credential account without a password hash as no password", async () => {
    const u = await signUp();
    await prisma.account.updateMany({
      where: { userId: u.userId, providerId: "credential" },
      data: { password: null },
    });
    // Better Auth asks for no password here, so the recent-sign-in rule must apply.
    await expect(enableTotp(u.headers)).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await prisma.twoFactor.count({ where: { userId: u.userId } })).toBe(0);
  });

  it("is allowed right after an SSO sign-in, not after REAUTH_MS", async () => {
    const u = await ssoOnlyUser();
    await prisma.session.updateMany({
      where: { userId: u.userId },
      data: { ssoSignInAt: new Date() },
    });
    await expect(addPasskey(u.headers)).resolves.toHaveProperty("challenge");
    await expect(enableTotp(u.headers)).resolves.toHaveProperty("totpURI");

    await prisma.session.updateMany({
      where: { userId: u.userId },
      data: { ssoSignInAt: new Date(Date.now() - 6 * 60_000) },
    });
    await expect(addPasskey(u.headers)).rejects.toMatchObject({ status: "FORBIDDEN" });
  });
});

describe("removing a factor", () => {
  /** A password user with a passkey and two proven sessions; returns the passkey id. */
  async function userWithPasskey() {
    const u = await signUp();
    await signIn(u.email);
    const pk = await addPasskeyRow(u.userId);
    await setSessionTimes(u.userId, { secondFactorAt: new Date() });
    const current = (await auth.api.getSession({ headers: u.headers }))!.session.id;
    return { ...u, passkeyId: pk.id, current };
  }

  it("needs a recent password confirmation for a passkey", async () => {
    const u = await userWithPasskey();
    await expect(
      auth.api.deletePasskey({ body: { id: u.passkeyId }, headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await prisma.passkey.count({ where: { userId: u.userId } })).toBe(1);
    expect(await sessionsOf(u.userId)).toHaveLength(2);
  });

  it("signs out every other session", async () => {
    const u = await userWithPasskey();
    await grantPasskeyReauth(u.current, u.userId);

    await auth.api.deletePasskey({ body: { id: u.passkeyId }, headers: u.headers });

    expect((await sessionsOf(u.userId)).map((s) => s.id)).toEqual([u.current]);
  });

  it("needs a recent sign-in without a password (authenticator app, backup codes)", async () => {
    const u = await ssoOnlyUser();
    await setSessionTimes(u.userId, { ssoSignInAt: new Date() });
    await auth.api.enableTwoFactor({ body: { method: "totp" }, headers: u.headers });
    await prisma.twoFactor.updateMany({ where: { userId: u.userId }, data: { verified: true } });
    await prisma.user.update({ where: { id: u.userId }, data: { twoFactorEnabled: true } });
    // Proven, but signed in a while ago.
    await setSessionTimes(u.userId, { ssoSignInAt: minutesAgo(6), secondFactorAt: minutesAgo(6) });

    await expect(
      auth.api.disableTwoFactor({ body: {}, headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(
      auth.api.generateBackupCodes({ body: {}, headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });

    await setSessionTimes(u.userId, { ssoSignInAt: new Date() });
    await expect(
      auth.api.generateBackupCodes({ body: {}, headers: u.headers }),
    ).resolves.toHaveProperty("backupCodes");
  });
});

describe("passkey sign-in", () => {
  // A real WebAuthn ceremony can't run here; drive the after hook with the context it reads.
  it("deletes the session it replaces", async () => {
    const u = await signUp();
    const [old] = await prisma.session.findMany({ where: { userId: u.userId } });
    const ctx = await auth.$context;
    const fakeCtx = {
      path: "/passkey/verify-authentication",
      getSignedCookie: async () => old.token,
      context: {
        returned: { session: {} },
        newSession: { session: { token: "new-token" } },
        authCookies: ctx.authCookies,
        secret: ctx.secret,
      },
    } as unknown as Parameters<typeof secondFactorAfter>[0];

    await secondFactorAfter(fakeCtx);
    expect(await prisma.session.count({ where: { id: old.id } })).toBe(0);
  });
});

describe("project requiring 2FA", () => {
  /** A password user without a factor whose active project requires 2FA. */
  async function lockedOut() {
    const u = await signUp();
    const org = await auth.api.createOrganization({
      body: { name: "P", slug: `p-${nanoid(8).toLowerCase()}` },
      headers: u.headers,
    });
    await auth.api.setActiveOrganization({ body: { organizationId: org!.id }, headers: u.headers });
    await prisma.organizationSettings.create({
      data: { organizationId: org!.id, requireTwoFactor: true },
    });
    return { ...u, orgId: org!.id };
  }

  it("lets a session that doesn't meet it clear its active project", async () => {
    const u = await lockedOut();
    await auth.api.setActiveOrganization({ body: { organizationId: null }, headers: u.headers });
    const s = await prisma.session.findFirstOrThrow({ where: { userId: u.userId } });
    expect(s.activeOrganizationId).toBeNull();
  });

  it("still refuses to make that project active", async () => {
    const u = await lockedOut();
    await auth.api.setActiveOrganization({ body: { organizationId: null }, headers: u.headers });
    await expect(
      auth.api.setActiveOrganization({ body: { organizationId: u.orgId }, headers: u.headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });
});
