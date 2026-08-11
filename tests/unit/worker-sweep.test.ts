import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findMany: vi.fn(),
  getQueue: vi.fn(),
  loggerChild: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    delivery: {
      updateMany: mocks.updateMany,
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/queue", () => ({
  DELIVERY_QUEUE: "delivery",
  getQueue: mocks.getQueue,
}));

vi.mock("@/worker/deliver", () => ({
  MAX_DELIVERY_AGE_MS: 24 * 60 * 60 * 1000,
  MAX_RETRIES: 5,
}));

vi.mock("@/lib/logger", () => {
  const logger = {
    child: mocks.loggerChild,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn(),
  };
  mocks.loggerChild.mockImplementation(() => logger);
  return { logger };
});

describe("startSweep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    mocks.updateMany.mockReset();
    mocks.findMany.mockReset();
    mocks.getQueue.mockReset();
    mocks.loggerInfo.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.loggerError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks stale deliveries and re-enqueues orphaned ones on each interval", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ count: 2 });
    mocks.findMany
      .mockResolvedValueOnce([
        { id: "del_1", message: { webhook: { publicId: "pub_1" } } },
        { id: "del_2", message: { webhook: { publicId: "pub_2" } } },
      ]) // orphaned
      .mockResolvedValueOnce([]) // stuck PROCESSING
      .mockResolvedValueOnce([]); // lost FAILED
    mocks.getQueue.mockResolvedValue({ insert });

    const { startSweep } = await import("@/worker/sweep");
    startSweep();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        attempts: 0,
        createdAt: { lt: new Date("2026-04-08T11:56:00.000Z") },
      },
      data: {
        status: "STALE",
        lastError: "Delivery was never picked up by a worker",
      },
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["PENDING", "STALE"] },
        attempts: 0,
        createdAt: {
          lt: new Date("2026-04-08T11:59:00.000Z"),
          gte: new Date("2026-04-07T12:01:00.000Z"),
        },
        updatedAt: { lt: new Date("2026-04-08T11:46:00.000Z") },
      },
      select: { id: true, message: { select: { webhook: { select: { publicId: true } } } } },
      take: 500,
    });
    expect(insert).toHaveBeenCalledWith("delivery", [
      { data: { deliveryId: "del_1", trace: ["pub_1"] } },
      { data: { deliveryId: "del_2", trace: ["pub_2"] } },
    ]);
    // pacing: re-enqueued rows get updatedAt bumped so the next ticks skip them
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["del_1", "del_2"] } },
      data: { lastError: "Re-enqueued by sweep" },
    });
  });

  it("recovers stuck PROCESSING deliveries and re-enqueues only recent ones", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findMany
      .mockResolvedValueOnce([]) // orphaned
      .mockResolvedValueOnce([
        {
          id: "del_old",
          createdAt: new Date("2026-04-06T12:00:00Z"),
          message: { webhook: { publicId: "pub_old" } },
        },
        {
          id: "del_new",
          createdAt: new Date("2026-04-08T11:00:00Z"),
          message: { webhook: { publicId: "pub_new" } },
        },
      ]) // stuck PROCESSING
      .mockResolvedValueOnce([]); // lost FAILED
    mocks.getQueue.mockResolvedValue({ insert });

    const { startSweep } = await import("@/worker/sweep");
    startSweep();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        status: "PROCESSING",
        updatedAt: { lt: new Date("2026-04-08T11:51:00.000Z") },
      },
      select: {
        id: true,
        createdAt: true,
        message: { select: { webhook: { select: { publicId: true } } } },
      },
      take: 500,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["del_old", "del_new"] }, status: "PROCESSING" },
      data: {
        status: "FAILED",
        lastError: "Worker crashed or job expired mid-delivery",
      },
    });
    expect(insert).toHaveBeenCalledWith("delivery", [
      { data: { deliveryId: "del_new", trace: ["pub_new"] } },
    ]);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("re-enqueues lost FAILED deliveries within the retry window", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findMany
      .mockResolvedValueOnce([]) // orphaned
      .mockResolvedValueOnce([]) // stuck PROCESSING
      .mockResolvedValueOnce([
        { id: "del_lost", message: { webhook: { publicId: "pub_lost" } } },
      ]); // lost FAILED
    mocks.getQueue.mockResolvedValue({ insert });

    const { startSweep } = await import("@/worker/sweep");
    startSweep();

    await vi.advanceTimersByTimeAsync(60_000);

    // fresh FAILED (updatedAt too recent, still inside live-retry cadence) and
    // >24h FAILED (createdAt too old) are excluded by these bounds — the query
    // never returns them, so only genuinely lost rows are re-enqueued.
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        status: "FAILED",
        attempts: { lt: 5 },
        updatedAt: { lt: new Date("2026-04-08T11:51:00.000Z") },
        createdAt: { gte: new Date("2026-04-07T12:01:00.000Z") },
      },
      select: { id: true, message: { select: { webhook: { select: { publicId: true } } } } },
      take: 500,
    });
    expect(insert).toHaveBeenCalledWith("delivery", [
      { data: { deliveryId: "del_lost", trace: ["pub_lost"] } },
    ]);
  });

  it("expires undelivered STALE deliveries older than 24h exactly once", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findMany.mockResolvedValue([]);

    const { startSweep } = await import("@/worker/sweep");
    startSweep();

    await vi.advanceTimersByTimeAsync(60_000);

    // the lastError guard keeps the update from rewriting the row every tick
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        status: "STALE",
        attempts: 0,
        createdAt: { lt: new Date("2026-04-07T12:01:00.000Z") },
        lastError: { not: "Expired: undelivered after 24 hours" },
      },
      data: { lastError: "Expired: undelivered after 24 hours" },
    });
  });

  it("skips queue startup when there are no orphaned deliveries", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findMany.mockResolvedValue([]);

    const { startSweep } = await import("@/worker/sweep");
    startSweep();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.getQueue).not.toHaveBeenCalled();
  });

  it("catches and logs sweep failures without throwing", async () => {
    mocks.updateMany.mockRejectedValue(new Error("db issue"));

    const { startSweep } = await import("@/worker/sweep");

    expect(() => startSweep()).not.toThrow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { error: "db issue" },
      "Sweep failed"
    );
  });

  it("stringifies non-Error failures when logging", async () => {
    mocks.updateMany.mockRejectedValue("boom");

    const { startSweep } = await import("@/worker/sweep");
    startSweep();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { error: "boom" },
      "Sweep failed"
    );
  });
});
