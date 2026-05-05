export type PlanId = "free" | "pro" | "business" | "enterprise";

interface PlanLimits {
  messages: number;
  webhooks: number | null; // null = unlimited
  channels: number | null;
  retentionDays: number;
  messagePack: { amount: number } | null;
}

export interface EffectiveLimits {
  messages: number | null; // null = unlimited
  webhooks: number | null;
  channels: number | null;
  retentionDays: number;
}

const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    messages: 3000,
    webhooks: 3,
    channels: 3,
    retentionDays: 7,
    messagePack: null,
  },
  pro: {
    messages: 25000,
    webhooks: 15,
    channels: null,
    retentionDays: 30,
    messagePack: { amount: 10000 },
  },
  business: {
    messages: 500000,
    webhooks: null,
    channels: null,
    retentionDays: 90,
    messagePack: { amount: 10000 },
  },
  // Manual-only tier. Assigned by an admin via DB (or the future admin panel);
  // never sold through Paddle and therefore absent from getPaddlePriceId.
  enterprise: {
    messages: 1_000_000,
    webhooks: null,
    channels: null,
    retentionDays: 365,
    messagePack: null,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLANS[plan as PlanId] ?? PLANS.free;
}

interface Overrides {
  overrideMessageLimit?: number | null;
  overrideWebhookLimit?: number | null;
  overrideChannelLimit?: number | null;
  overrideRetentionDays?: number | null;
}

export function resolveEffectiveLimits(
  plan: string,
  overrides: Overrides,
  purchasedPacks: number = 0,
): EffectiveLimits {
  const base = getPlanLimits(plan);

  function resolve(
    planDefault: number | null,
    override: number | null | undefined,
  ): number | null {
    if (override === -1) return null;
    if (override != null) return override;
    return planDefault;
  }

  let messages = resolve(base.messages, overrides.overrideMessageLimit);
  if (messages !== null && base.messagePack && purchasedPacks > 0) {
    messages += purchasedPacks * base.messagePack.amount;
  }

  return {
    messages,
    webhooks: resolve(base.webhooks, overrides.overrideWebhookLimit),
    channels: resolve(base.channels, overrides.overrideChannelLimit),
    retentionDays: overrides.overrideRetentionDays ?? base.retentionDays,
  };
}

export function getPaddlePriceId(plan: PlanId): string | null {
  switch (plan) {
    case "pro":
      return process.env.PADDLE_PRICE_ID_PRO ?? null;
    case "business":
      return process.env.PADDLE_PRICE_ID_BUSINESS ?? null;
    default:
      return null;
  }
}

export function getMessagePackPriceId(): string | null {
  return process.env.PADDLE_PRICE_ID_MESSAGE_PACK ?? null;
}

export function getPlanFromPriceId(priceId: string): PlanId {
  if (priceId === process.env.PADDLE_PRICE_ID_PRO) return "pro";
  if (priceId === process.env.PADDLE_PRICE_ID_BUSINESS) return "business";
  return "free";
}
