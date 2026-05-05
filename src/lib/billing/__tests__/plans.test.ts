import { describe, it, expect } from "vitest";
import { getPlanLimits, resolveEffectiveLimits } from "../plans";

describe("getPlanLimits", () => {
  it("returns free tier limits", () => {
    const limits = getPlanLimits("free");
    expect(limits.messages).toBe(3000);
    expect(limits.webhooks).toBe(3);
    expect(limits.channels).toBe(3);
    expect(limits.retentionDays).toBe(7);
    expect(limits.messagePack).toBeNull();
  });

  it("returns pro tier limits", () => {
    const limits = getPlanLimits("pro");
    expect(limits.messages).toBe(25000);
    expect(limits.webhooks).toBe(15);
    expect(limits.channels).toBeNull();
    expect(limits.retentionDays).toBe(30);
    expect(limits.messagePack).toEqual({ amount: 10000 });
  });

  it("returns business tier limits", () => {
    const limits = getPlanLimits("business");
    expect(limits.messages).toBe(500000);
    expect(limits.webhooks).toBeNull();
    expect(limits.channels).toBeNull();
    expect(limits.retentionDays).toBe(90);
  });

  it("returns enterprise tier limits", () => {
    const limits = getPlanLimits("enterprise");
    expect(limits.messages).toBe(1_000_000);
    expect(limits.webhooks).toBeNull();
    expect(limits.channels).toBeNull();
    expect(limits.retentionDays).toBe(365);
    expect(limits.messagePack).toBeNull();
  });

  it("defaults to free for unknown plan", () => {
    const limits = getPlanLimits("unknown");
    expect(limits.messages).toBe(3000);
  });
});

describe("resolveEffectiveLimits", () => {
  it("uses plan defaults when no overrides", () => {
    const limits = resolveEffectiveLimits("pro", {});
    expect(limits.messages).toBe(25000);
    expect(limits.webhooks).toBe(15);
  });

  it("applies override when set", () => {
    const limits = resolveEffectiveLimits("free", {
      overrideMessageLimit: 100000,
    });
    expect(limits.messages).toBe(100000);
  });

  it("treats -1 override as unlimited (null)", () => {
    const limits = resolveEffectiveLimits("free", {
      overrideWebhookLimit: -1,
    });
    expect(limits.webhooks).toBeNull();
  });

  it("calculates total message allowance with purchased packs", () => {
    const limits = resolveEffectiveLimits("pro", {}, 3);
    expect(limits.messages).toBe(55000);
  });

  it("does not add packs to free plan (no packs available)", () => {
    const limits = resolveEffectiveLimits("free", {}, 5);
    expect(limits.messages).toBe(3000);
  });

  it("applies enterprise defaults with unlimited webhooks and channels", () => {
    const limits = resolveEffectiveLimits("enterprise", {});
    expect(limits.messages).toBe(1_000_000);
    expect(limits.webhooks).toBeNull();
    expect(limits.channels).toBeNull();
    expect(limits.retentionDays).toBe(365);
  });

  it("allows overriding enterprise message limit to unlimited", () => {
    const limits = resolveEffectiveLimits("enterprise", {
      overrideMessageLimit: -1,
    });
    expect(limits.messages).toBeNull();
  });
});
