import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    organization: { findMany: mocks.findMany },
    message: { deleteMany: mocks.deleteMany },
  },
}));

vi.mock("@/lib/billing/paddle", () => ({ isBillingEnabled: () => true }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { startRetentionSweep } from "@/worker/retention";

const DAY_MS = 24 * 60 * 60 * 1000;

function sub(overrides: Record<string, unknown>) {
  return {
    plan: "pro",
    status: "active",
    currentPeriodEnd: null,
    overrideMessageLimit: null,
    overrideWebhookLimit: null,
    overrideChannelLimit: null,
    overrideRetentionDays: null,
    purchasedPacks: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("retention sweep", () => {
  it("uses the effective plan's retention, not the raw plan", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "Date"] });
    const now = new Date("2026-06-15T12:00:00Z");
    vi.setSystemTime(now);

    mocks.findMany.mockResolvedValue([
      { id: "active-pro", subscription: sub({}) },
      { id: "paused-pro", subscription: sub({ status: "paused" }) },
      {
        id: "lapsed-pro",
        subscription: sub({ status: "cancelled", currentPeriodEnd: new Date(now.getTime() - DAY_MS) }),
      },
      { id: "override", subscription: sub({ status: "paused", overrideRetentionDays: 60 }) },
      { id: "no-sub", subscription: null },
    ]);
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    startRetentionSweep();
    await vi.waitFor(() => expect(mocks.deleteMany).toHaveBeenCalledTimes(3));

    const byDays = new Map<number, string[]>();
    for (const [args] of mocks.deleteMany.mock.calls) {
      const cutoff: Date = args.where.createdAt.lt;
      const days = Math.round((now.getTime() - cutoff.getTime()) / DAY_MS);
      byDays.set(days, args.where.webhook.organizationId.in);
    }
    expect(byDays.get(30)).toEqual(["active-pro"]);
    expect(byDays.get(7)).toEqual(["paused-pro", "lapsed-pro", "no-sub"]);
    expect(byDays.get(60)).toEqual(["override"]);
  });
});
