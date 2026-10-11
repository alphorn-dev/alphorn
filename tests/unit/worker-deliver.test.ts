import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDelivery: vi.fn(),
  updateDelivery: vi.fn(),
  updateManyDelivery: vi.fn(),
  getChannel: vi.fn(),
  notifyFailure: vi.fn(),
  loggerChild: vi.fn(),
  enforceRateLimit: vi.fn(),
  queueInsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    delivery: {
      findUnique: mocks.findDelivery,
      update: mocks.updateDelivery,
      updateMany: mocks.updateManyDelivery,
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  RateLimitError: class RateLimitError extends Error {
    constructor(public readonly retryAfterMs: number) {
      super("Rate limit exceeded");
      this.name = "RateLimitError";
    }
  },
}));

vi.mock("@/lib/queue", () => ({
  getQueue: async () => ({ insert: mocks.queueInsert }),
  DELIVERY_QUEUE: "delivery",
}));

vi.mock("@/channels", () => ({
  getChannel: mocks.getChannel,
}));

vi.mock("@/worker/failure-notifier", () => ({
  notifyFailure: mocks.notifyFailure,
}));

vi.mock("@/lib/logger", () => {
  const logger = {
    child: mocks.loggerChild,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  mocks.loggerChild.mockImplementation(() => logger);
  return { logger };
});

function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "del_1",
    channelId: "ch_1",
    messageId: "msg_1",
    attempts: 0,
    channel: {
      id: "ch_1",
      type: "slack",
      name: "Slack",
      config: { token: "x" },
      enabled: true,
      deletedAt: null,
    },
    message: {
      id: "msg_1",
      title: "Alert",
      message: "Something happened",
      priority: 5,
      tags: ["ops"],
      payload: { source: "monitor" },
    },
    ...overrides,
  };
}

describe("handleDelivery", () => {
  beforeEach(() => {
    mocks.findDelivery.mockReset();
    mocks.updateDelivery.mockReset();
    mocks.updateManyDelivery.mockReset().mockResolvedValue({ count: 1 });
    mocks.getChannel.mockReset();
    mocks.notifyFailure.mockReset();
    mocks.enforceRateLimit.mockReset().mockResolvedValue(undefined);
    mocks.queueInsert.mockReset().mockResolvedValue(undefined);
  });

  it("throws when the delivery record does not exist", async () => {
    mocks.findDelivery.mockResolvedValue(null);

    const { handleDelivery } = await import("@/worker/deliver");

    await expect(handleDelivery({ deliveryId: "missing" })).rejects.toThrow(
      "Delivery missing not found"
    );
  });

  it("drops the delivery without sending or alerting when the channel was disabled", async () => {
    const send = vi.fn();
    mocks.findDelivery.mockResolvedValue(
      makeDelivery({ channel: { ...makeDelivery().channel, enabled: false } })
    );
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
    mocks.updateDelivery.mockResolvedValue({});

    const { handleDelivery } = await import("@/worker/deliver");
    await handleDelivery({ deliveryId: "del_1" });

    expect(send).not.toHaveBeenCalled();
    expect(mocks.updateDelivery).toHaveBeenCalledWith({
      where: { id: "del_1" },
      data: { status: "FAILED", attempts: 5, lastError: "Channel disabled" },
    });
    expect(mocks.notifyFailure).not.toHaveBeenCalled();
  });

  it("marks the delivery failed when the channel type is unknown", async () => {
    mocks.findDelivery.mockResolvedValue(makeDelivery());
    mocks.getChannel.mockReturnValue(undefined);
    mocks.updateDelivery.mockResolvedValue({});

    const { handleDelivery } = await import("@/worker/deliver");
    await handleDelivery({ deliveryId: "del_1" });

    expect(mocks.updateManyDelivery).toHaveBeenCalledWith({
      where: {
        id: "del_1",
        status: { in: ["PENDING", "FAILED", "STALE"] },
        createdAt: { gte: expect.any(Date) },
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
      },
    });
    expect(mocks.updateDelivery).toHaveBeenCalledWith({
      where: { id: "del_1" },
      data: {
        status: "FAILED",
        attempts: 5,
        lastError: "Unknown channel type: slack",
      },
    });
    expect(mocks.notifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "del_1" })
    );
  });

  it("releases the claim and reschedules without sending when the channel is throttled", async () => {
    mocks.findDelivery.mockResolvedValue(makeDelivery()); // channel type "slack" is rate-limited
    const send = vi.fn();
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
    mocks.updateDelivery.mockResolvedValue({});
    const { RateLimitError } = await import("@/lib/rate-limit");
    mocks.enforceRateLimit.mockRejectedValue(new RateLimitError(3000));

    const { handleDelivery } = await import("@/worker/deliver");
    await handleDelivery({ deliveryId: "del_1", trace: ["pub_1"] });

    // Not sent, not failed.
    expect(send).not.toHaveBeenCalled();
    expect(mocks.notifyFailure).not.toHaveBeenCalled();
    // Claim released: back to PENDING, attempt increment undone.
    expect(mocks.updateDelivery).toHaveBeenCalledWith({
      where: { id: "del_1" },
      data: { status: "PENDING", attempts: { decrement: 1 } },
    });
    // Rescheduled with a delay, preserving the trace.
    expect(mocks.queueInsert).toHaveBeenCalledWith("delivery", [
      { data: { deliveryId: "del_1", trace: ["pub_1"] }, startAfter: 3 },
    ]);
  });

  it("skips the delivery when the claim finds no eligible row", async () => {
    mocks.findDelivery.mockResolvedValue(makeDelivery({ status: "DELIVERED" }));
    mocks.updateManyDelivery.mockResolvedValue({ count: 0 });
    const send = vi.fn();
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });

    const { handleDelivery } = await import("@/worker/deliver");
    await handleDelivery({ deliveryId: "del_1" });

    expect(send).not.toHaveBeenCalled();
    expect(mocks.updateDelivery).not.toHaveBeenCalled();
    expect(mocks.notifyFailure).not.toHaveBeenCalled();
  });

  it("claims STALE deliveries created within the last 24 hours and delivers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
    try {
      const send = vi.fn().mockResolvedValue(undefined);
      mocks.findDelivery.mockResolvedValue(makeDelivery({ status: "STALE" }));
      mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
      mocks.updateDelivery.mockResolvedValue({});

      const { handleDelivery } = await import("@/worker/deliver");
      await handleDelivery({ deliveryId: "del_1" });

      expect(mocks.updateManyDelivery).toHaveBeenCalledWith({
        where: {
          id: "del_1",
          status: { in: ["PENDING", "FAILED", "STALE"] },
          createdAt: { gte: new Date("2026-04-07T12:00:00.000Z") },
        },
        data: {
          status: "PROCESSING",
          attempts: { increment: 1 },
        },
      });
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not send when the claim excludes a delivery older than 24 hours", async () => {
    // The 24h bound lives in the claim's where clause, so the DB matches no
    // row for an expired delivery and the worker skips it.
    mocks.updateManyDelivery.mockResolvedValue({ count: 0 });
    mocks.findDelivery.mockResolvedValue(makeDelivery({ status: "STALE" }));
    const send = vi.fn();
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });

    const { handleDelivery } = await import("@/worker/deliver");
    await handleDelivery({ deliveryId: "del_1" });

    expect(send).not.toHaveBeenCalled();
    expect(mocks.updateDelivery).not.toHaveBeenCalled();
  });

  it("sends the notification and marks the delivery delivered", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    mocks.findDelivery.mockResolvedValue(makeDelivery());
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
    mocks.updateDelivery.mockResolvedValue({});

    const { handleDelivery } = await import("@/worker/deliver");
    await handleDelivery({ deliveryId: "del_1" });

    expect(send).toHaveBeenCalledWith(
      { token: "x" },
      {
        title: "Alert",
        message: "Something happened",
        priority: 5,
        tags: ["ops"],
        payload: { source: "monitor" },
      },
      {
        channelId: "ch_1",
        deliveryId: "del_1",
      }
    );
    expect(mocks.updateDelivery).toHaveBeenLastCalledWith({
      where: { id: "del_1" },
      data: {
        status: "DELIVERED",
        deliveredAt: expect.any(Date),
      },
    });
  });

  it("omits undefined notification fields when priority, tags, and payload are empty", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    mocks.findDelivery.mockResolvedValue(
      makeDelivery({
        message: {
          id: "msg_1",
          title: "Alert",
          message: "Something happened",
          priority: null,
          tags: [],
          payload: null,
        },
      })
    );
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
    mocks.updateDelivery.mockResolvedValue({});

    const { handleDelivery } = await import("@/worker/deliver");
    await handleDelivery({ deliveryId: "del_1" });

    expect(send).toHaveBeenCalledWith(
      { token: "x" },
      {
        title: "Alert",
        message: "Something happened",
        priority: undefined,
        tags: undefined,
        payload: undefined,
      },
      {
        channelId: "ch_1",
        deliveryId: "del_1",
      }
    );
  });

  it("rethrows transient failures so pg-boss can retry", async () => {
    const error = new Error("temporary failure");
    const send = vi.fn().mockRejectedValue(error);

    mocks.findDelivery.mockResolvedValue(makeDelivery({ attempts: 1 }));
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
    mocks.updateDelivery.mockResolvedValue({ attempts: 2 });

    const { handleDelivery } = await import("@/worker/deliver");

    await expect(handleDelivery({ deliveryId: "del_1" })).rejects.toThrow(
      "temporary failure"
    );
    expect(mocks.notifyFailure).not.toHaveBeenCalled();
    expect(mocks.updateDelivery).toHaveBeenLastCalledWith({
      where: { id: "del_1" },
      data: {
        status: "FAILED",
        lastError: "temporary failure",
      },
    });
  });

  it("sends a failure notification after the final retry", async () => {
    const error = new Error("permanent failure");
    const send = vi.fn().mockRejectedValue(error);

    mocks.findDelivery.mockResolvedValue(makeDelivery({ attempts: 4 }));
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
    mocks.updateDelivery.mockResolvedValue({ attempts: 5 });

    const { handleDelivery } = await import("@/worker/deliver");
    await expect(
      handleDelivery({ deliveryId: "del_1" })
    ).resolves.toBeUndefined();

    expect(mocks.notifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "del_1" })
    );
  });

  it("does not retry permanent channel errors and notifies immediately", async () => {
    const { PermanentChannelError } = await import("@/channels/errors");
    const error = new PermanentChannelError("message too long");
    const send = vi.fn().mockRejectedValue(error);

    mocks.findDelivery.mockResolvedValue(makeDelivery({ attempts: 0 }));
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
    mocks.updateDelivery.mockResolvedValue({ attempts: 1 });

    const { handleDelivery } = await import("@/worker/deliver");

    await expect(
      handleDelivery({ deliveryId: "del_1" })
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect(mocks.notifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "del_1" })
    );
    expect(mocks.updateDelivery).toHaveBeenLastCalledWith({
      where: { id: "del_1" },
      data: {
        status: "FAILED",
        attempts: 5,
        lastError: "message too long",
      },
    });
  });

  it("treats a ZodError from the config schema as permanent and notifies without retrying", async () => {
    const { z } = await import("zod");
    const configSchema = z.object({ token: z.string() });
    const send = vi.fn();

    mocks.findDelivery.mockResolvedValue(
      makeDelivery({
        attempts: 0,
        channel: { id: "ch_1", type: "slack", name: "Slack", config: {}, enabled: true, deletedAt: null },
      })
    );
    mocks.getChannel.mockReturnValue({ configSchema, send });
    mocks.updateDelivery.mockResolvedValue({ attempts: 1 });

    const { handleDelivery } = await import("@/worker/deliver");

    await expect(
      handleDelivery({ deliveryId: "del_1" })
    ).resolves.toBeUndefined();

    // parse fails before send, no retry (resolves, not rejects), and notifies
    expect(send).not.toHaveBeenCalled();
    expect(mocks.notifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "del_1" })
    );
    expect(mocks.updateDelivery).toHaveBeenLastCalledWith({
      where: { id: "del_1" },
      data: {
        status: "FAILED",
        attempts: 5,
        lastError: expect.stringContaining("Invalid channel config"),
      },
    });
  });

  it("stores 'Unknown error' when a non-Error value is thrown", async () => {
    const send = vi.fn().mockRejectedValue("bad");

    mocks.findDelivery.mockResolvedValue(makeDelivery({ attempts: 1 }));
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });
    mocks.updateDelivery.mockResolvedValue({ attempts: 2 });

    const { handleDelivery } = await import("@/worker/deliver");

    await expect(handleDelivery({ deliveryId: "del_1" })).rejects.toBe("bad");
    expect(mocks.updateDelivery).toHaveBeenLastCalledWith({
      where: { id: "del_1" },
      data: {
        status: "FAILED",
        lastError: "Unknown error",
      },
    });
  });
});
