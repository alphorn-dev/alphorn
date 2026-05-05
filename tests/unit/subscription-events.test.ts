import { describe, expect, it } from "vitest";
import { classifyTransition } from "@/lib/billing/subscription-events";

describe("classifyTransition", () => {
  it("returns 'created' when there is no previous status", () => {
    expect(
      classifyTransition({
        fromStatus: null,
        toStatus: "active",
        planChanged: true,
      }),
    ).toBe("created");
  });

  it("returns 'created' regardless of incoming status for a first-seen org", () => {
    expect(
      classifyTransition({
        fromStatus: null,
        toStatus: "cancelled",
        planChanged: true,
      }),
    ).toBe("created");
  });

  it("returns 'cancelled' on transition to cancelled", () => {
    expect(
      classifyTransition({
        fromStatus: "active",
        toStatus: "cancelled",
        planChanged: false,
      }),
    ).toBe("cancelled");
  });

  it("returns 'paused' on transition to paused", () => {
    expect(
      classifyTransition({
        fromStatus: "active",
        toStatus: "paused",
        planChanged: false,
      }),
    ).toBe("paused");
  });

  it("returns 'past_due' on transition to past_due", () => {
    expect(
      classifyTransition({
        fromStatus: "active",
        toStatus: "past_due",
        planChanged: false,
      }),
    ).toBe("past_due");
  });

  it("returns 'reactivated' when coming back to active from cancelled", () => {
    expect(
      classifyTransition({
        fromStatus: "cancelled",
        toStatus: "active",
        planChanged: false,
      }),
    ).toBe("reactivated");
  });

  it("returns 'reactivated' when coming back to active from paused", () => {
    expect(
      classifyTransition({
        fromStatus: "paused",
        toStatus: "active",
        planChanged: false,
      }),
    ).toBe("reactivated");
  });

  it("returns 'reactivated' when coming back to active from past_due", () => {
    expect(
      classifyTransition({
        fromStatus: "past_due",
        toStatus: "active",
        planChanged: false,
      }),
    ).toBe("reactivated");
  });

  it("does not treat trialing → active as reactivated", () => {
    expect(
      classifyTransition({
        fromStatus: "trialing",
        toStatus: "active",
        planChanged: false,
      }),
    ).toBe("updated");
  });

  it("returns 'plan_changed' when the plan changed and status stayed active", () => {
    expect(
      classifyTransition({
        fromStatus: "active",
        toStatus: "active",
        planChanged: true,
      }),
    ).toBe("plan_changed");
  });

  it("returns 'updated' when nothing notable changed", () => {
    expect(
      classifyTransition({
        fromStatus: "active",
        toStatus: "active",
        planChanged: false,
      }),
    ).toBe("updated");
  });

  it("prioritizes cancelled over plan_changed when both happen at once", () => {
    expect(
      classifyTransition({
        fromStatus: "active",
        toStatus: "cancelled",
        planChanged: true,
      }),
    ).toBe("cancelled");
  });
});
