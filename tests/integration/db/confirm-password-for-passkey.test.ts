import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// The action under test runs outside a Next request: hand it a real signed-in session.
const ctx = vi.hoisted(() => ({ headers: new Headers(), userId: "", sessionId: "" }));
vi.mock("next/headers", () => ({ headers: async () => ctx.headers }));
vi.mock("@/lib/auth/server", () => ({
  requireSession: async () => ({ user: { id: ctx.userId }, session: { id: ctx.sessionId } }),
}));

import { confirmPasswordForPasskey } from "@/app/(dashboard)/profile/actions";

const PASSWORD = "correct-horse-battery-1";

async function signedIn() {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email: `u_${nanoid(8).toLowerCase()}@example.com`, password: PASSWORD, name: "U" },
    returnHeaders: true,
  });
  ctx.headers = new Headers({
    cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
  });
  ctx.userId = response.user.id;
  ctx.sessionId = (await prisma.session.findFirstOrThrow({ where: { userId: ctx.userId } })).id;
}

const confirmations = () =>
  prisma.verification.count({ where: { identifier: `passkey-reauth:${ctx.sessionId}` } });

describe("confirmPasswordForPasskey", () => {
  it("records a confirmation for this session only with the right password", async () => {
    await signedIn();
    expect(await confirmPasswordForPasskey("wrong-password")).toEqual({
      ok: false,
      reason: "invalid_password",
    });
    expect(await confirmations()).toBe(0);

    expect(await confirmPasswordForPasskey(PASSWORD)).toEqual({ ok: true });
    expect(await confirmations()).toBe(1);
  });

  it("is rate limited to 5 attempts a minute", async () => {
    await signedIn();
    for (let i = 0; i < 5; i++) await confirmPasswordForPasskey("wrong-password");
    const res = await confirmPasswordForPasskey(PASSWORD);
    expect(res).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(await confirmations()).toBe(0);
  });
});
