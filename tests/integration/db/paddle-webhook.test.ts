import { createHmac } from "crypto";
import { nanoid } from "nanoid";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

// Real signature verification and event parsing: the events are signed here
// exactly like Paddle signs them. Env must be set before the route (and
// paddleEnv's cache) is first imported.
const SECRET = "pdl_test_webhook_secret";
const PRO_PRICE = "pri_test_pro";
process.env.PADDLE_API_KEY = "pdl_test_api_key";
process.env.PADDLE_WEBHOOK_SECRET = SECRET;
process.env.PADDLE_PRICE_ID_PRO = PRO_PRICE;
process.env.PADDLE_PRICE_ID_BUSINESS = "pri_test_business";
process.env.PADDLE_PRICE_ID_MESSAGE_PACK = "pri_test_pack";
process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "test_client_token";

let orgId: string;

beforeEach(async () => {
  orgId = `org_${nanoid(10)}`;
  // The Subscription row (plan free) is created by a DB trigger.
  await prisma.organization.create({ data: { id: orgId, name: "Paddle test org" } });
});

function subscriptionEvent(
  eventType: string,
  opts: { priceId?: string; status?: string; updatedAt?: string; customData?: object | null } = {},
) {
  const now = new Date().toISOString();
  return {
    event_id: `evt_${nanoid(10)}`,
    notification_id: `ntf_${nanoid(10)}`,
    event_type: eventType,
    occurred_at: now,
    data: {
      id: "sub_test",
      status: opts.status ?? "active",
      customer_id: "ctm_test",
      address_id: "add_test",
      currency_code: "EUR",
      created_at: now,
      updated_at: opts.updatedAt ?? now,
      collection_mode: "automatic",
      billing_cycle: { interval: "month", frequency: 1 },
      current_billing_period: {
        starts_at: now,
        ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
      items: [
        {
          status: "active",
          quantity: 1,
          recurring: true,
          created_at: now,
          updated_at: now,
          price: {
            id: opts.priceId ?? PRO_PRICE,
            product_id: "pro_test",
            description: "Plan",
            tax_mode: "account_setting",
          },
        },
      ],
      custom_data: opts.customData === undefined ? { organizationId: orgId } : opts.customData,
    },
  };
}

async function deliver(event: object) {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex");
  const { POST } = await import("@/app/api/paddle/webhook/route");
  return POST(
    new Request("https://app.test/api/paddle/webhook", {
      method: "POST",
      headers: { "paddle-signature": `ts=${ts};h1=${h1}` },
      body,
    }),
  );
}

const subscription = () => prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });

describe("Paddle webhook", () => {
  it("applies Paddle's retry of an event whose first attempt failed", async () => {
    // No customData and no stored link yet: the first attempt asks for a retry.
    const event = subscriptionEvent("subscription.created", { customData: null });
    expect((await deliver(event)).status).toBe(503);

    // The checkout flow has stored the link by the time Paddle retries.
    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: { paddleSubscriptionId: "sub_test" },
    });
    expect((await deliver(event)).status).toBe(200);
    expect((await subscription()).plan).toBe("pro");

    // A third delivery of the same event is a duplicate and changes nothing.
    expect((await deliver(event)).status).toBe(200);
    expect(await prisma.paddleEvent.count({ where: { id: event.event_id } })).toBe(1);
  });

  it("refuses a subscription without a known plan price instead of downgrading to free", async () => {
    await deliver(subscriptionEvent("subscription.created"));
    expect((await subscription()).plan).toBe("pro");

    const res = await deliver(
      subscriptionEvent("subscription.updated", {
        priceId: "pri_unknown",
        updatedAt: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    expect(res.status).toBe(200);
    expect((await subscription()).plan).toBe("pro");
  });

  it("disables resources over the free limit when paused, but not while past_due", async () => {
    await deliver(subscriptionEvent("subscription.created"));
    await prisma.webhook.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        id: `wh_${nanoid(10)}`,
        name: `Webhook ${i}`,
        apiKeyHash: `hash_${nanoid(20)}`,
        apiKeyPrefix: "alp_test",
        publicId: nanoid(12),
        organizationId: orgId,
      })),
    });
    const enabledWebhooks = () =>
      prisma.webhook.count({ where: { organizationId: orgId, enabled: true } });

    await deliver(
      subscriptionEvent("subscription.past_due", {
        status: "past_due",
        updatedAt: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    expect(await enabledWebhooks()).toBe(5);

    await deliver(
      subscriptionEvent("subscription.paused", {
        status: "paused",
        updatedAt: new Date(Date.now() + 2000).toISOString(),
      }),
    );
    expect(await enabledWebhooks()).toBe(3); // free plan limit
  });
});
