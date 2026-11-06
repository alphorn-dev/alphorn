import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

// Billing (hosted) is on when Paddle is configured; env must be set before
// paddleEnv's cache is first read.
process.env.PADDLE_API_KEY = "pdl_test_api_key";
process.env.PADDLE_WEBHOOK_SECRET = "pdl_test_webhook_secret";
process.env.PADDLE_PRICE_ID_PRO = "pri_test_pro";
process.env.PADDLE_PRICE_ID_BUSINESS = "pri_test_business";
process.env.PADDLE_PRICE_ID_MESSAGE_PACK = "pri_test_pack";
process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "test_client_token";

const { auth } = await import("@/lib/auth");
const { prisma } = await import("@/lib/db");

async function signUp() {
  const { headers } = await auth.api.signUpEmail({
    body: { email: `u_${nanoid(8).toLowerCase()}@example.com`, password: "correct-horse-battery-1", name: "U" },
    returnHeaders: true,
  });
  return new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}

const create = (headers: Headers) =>
  auth.api.createOrganization({ body: { name: "P", slug: `p-${nanoid(8).toLowerCase()}` }, headers });

describe("free project limit (hosted)", () => {
  it("allows 3 free projects per owner, and more once one is paid", async () => {
    const headers = await signUp();
    const [first] = [await create(headers), await create(headers), await create(headers)];

    await expect(create(headers)).rejects.toMatchObject({ status: "FORBIDDEN" });

    await prisma.subscription.update({
      where: { organizationId: first!.id },
      data: { plan: "pro", status: "active" },
    });
    expect(await create(headers)).toMatchObject({ name: "P" });
  });

  it("counts only projects the user owns", async () => {
    const other = await signUp();
    const org = await create(other);
    const headers = await signUp();
    const me = await auth.api.getSession({ headers });
    await prisma.member.create({
      data: { id: nanoid(), organizationId: org!.id, userId: me!.user.id, role: "admin", createdAt: new Date() },
    });

    for (let i = 0; i < 3; i++) await create(headers);
    await expect(create(headers)).rejects.toMatchObject({ status: "FORBIDDEN" });
  });
});
