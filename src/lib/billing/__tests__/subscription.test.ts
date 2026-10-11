import { describe, it, expect } from "vitest";
import { effectivePlan, isWithinQuota, usagePeriodStart } from "../subscription";

describe("isWithinQuota", () => {
  it("returns true when usage is under limit", () => {
    expect(isWithinQuota(100, 5000)).toBe(true);
  });

  it("returns false when usage meets limit", () => {
    expect(isWithinQuota(5000, 5000)).toBe(false);
  });

  it("returns true when limit is null (unlimited)", () => {
    expect(isWithinQuota(999999, null)).toBe(true);
  });
});

describe("effectivePlan", () => {
  const base = { plan: "pro", currentPeriodEnd: null as Date | null };
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it("keeps the plan while active, trialing, or past_due (dunning)", () => {
    expect(effectivePlan({ ...base, status: "active" })).toBe("pro");
    expect(effectivePlan({ ...base, status: "trialing" })).toBe("pro");
    expect(effectivePlan({ ...base, status: "past_due" })).toBe("pro");
  });

  it("drops to free when paused", () => {
    expect(effectivePlan({ ...base, status: "paused" })).toBe("free");
  });

  it("keeps a cancelled plan until the paid period ends", () => {
    expect(
      effectivePlan({ ...base, status: "cancelled", currentPeriodEnd: future }),
    ).toBe("pro");
    expect(
      effectivePlan({ ...base, status: "cancelled", currentPeriodEnd: past }),
    ).toBe("free");
    expect(effectivePlan({ ...base, status: "cancelled" })).toBe("free");
  });
});

describe("usagePeriodStart", () => {
  const periodStart = new Date("2026-01-15T00:00:00Z");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  it("uses the billing period while the paid plan applies", () => {
    expect(
      usagePeriodStart({ plan: "pro", status: "active", currentPeriodStart: periodStart, currentPeriodEnd: null }),
    ).toEqual(periodStart);
  });

  it("falls back to the calendar month once the paid plan lapsed", () => {
    expect(
      usagePeriodStart({ plan: "pro", status: "paused", currentPeriodStart: periodStart, currentPeriodEnd: null }),
    ).toEqual(monthStart);
  });

  it("uses the calendar month without a billing period", () => {
    expect(
      usagePeriodStart({ plan: "free", status: "active", currentPeriodStart: null, currentPeriodEnd: null }),
    ).toEqual(monthStart);
  });
});
