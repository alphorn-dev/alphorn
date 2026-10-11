import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { claimPaddleEvent } from "@/lib/billing/paddle-events";

const claim = (id: string) =>
  prisma.$transaction((tx) => claimPaddleEvent(tx, id, "subscription.created"));

describe("claimPaddleEvent", () => {
  it("claims a new event once and reports later deliveries as duplicates", async () => {
    expect(await claim("evt_new")).toBe(true);
    expect(await claim("evt_new")).toBe(false);
  });

  it("re-claims an event whose previous attempt failed", async () => {
    // What the route's error paths leave behind after a rolled-back attempt.
    await prisma.paddleEvent.create({
      data: { id: "evt_failed", type: "subscription.created", error: "boom" },
    });

    expect(await claim("evt_failed")).toBe(true);
    const row = await prisma.paddleEvent.findUniqueOrThrow({ where: { id: "evt_failed" } });
    expect(row.processedAt).not.toBeNull();
    expect(row.error).toBeNull();
  });

  it("leaves the event unclaimed when the handler rolls back", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await claimPaddleEvent(tx, "evt_rollback", "subscription.created");
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");

    expect(await claim("evt_rollback")).toBe(true);
  });

  it("lets only one of two concurrent deliveries through", async () => {
    const results = await Promise.all([claim("evt_race"), claim("evt_race")]);
    expect(results.sort()).toEqual([false, true]);
  });
});
