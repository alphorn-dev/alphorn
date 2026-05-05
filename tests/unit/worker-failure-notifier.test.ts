import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDelivery: vi.fn(),
  findSettings: vi.fn(),
  findChannel: vi.fn(),
  getChannel: vi.fn(),
  loggerChild: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    delivery: {
      findUnique: mocks.findDelivery,
    },
    organizationSettings: {
      findUnique: mocks.findSettings,
    },
    channel: {
      findUnique: mocks.findChannel,
    },
  },
}));

vi.mock("@/channels", () => ({
  getChannel: mocks.getChannel,
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
    channelId: "failed_channel",
    attempts: 5,
    lastError: "boom",
    channel: {
      id: "failed_channel",
      name: "Broken Slack",
      type: "slack",
      organizationId: "org_1",
    },
    message: {
      title: "Main alert",
      webhook: {
        name: "Critical webhook",
      },
    },
    ...overrides,
  };
}

describe("notifyFailure", () => {
  beforeEach(() => {
    mocks.findDelivery.mockReset();
    mocks.findSettings.mockReset();
    mocks.findChannel.mockReset();
    mocks.getChannel.mockReset();
  });

  it("returns when the delivery cannot be found", async () => {
    mocks.findDelivery.mockResolvedValue(null);

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await expect(notifyFailure("missing")).resolves.toBeUndefined();
  });

  it("returns when no failure notification channel is configured", async () => {
    mocks.findDelivery.mockResolvedValue(makeDelivery());
    mocks.findSettings.mockResolvedValue(null);

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure("del_1");

    expect(mocks.findChannel).not.toHaveBeenCalled();
  });

  it("avoids infinite loops when the failed channel is the failure channel", async () => {
    mocks.findDelivery.mockResolvedValue(makeDelivery());
    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "failed_channel",
    });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure("del_1");

    expect(mocks.findChannel).not.toHaveBeenCalled();
  });

  it("returns when the failure channel is disabled or missing", async () => {
    mocks.findDelivery.mockResolvedValue(makeDelivery());
    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({ id: "notify_channel", enabled: false });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure("del_1");

    expect(mocks.getChannel).not.toHaveBeenCalled();
  });

  it("returns when there is no handler for the failure channel type", async () => {
    mocks.findDelivery.mockResolvedValue(makeDelivery());
    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({
      id: "notify_channel",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://discord.test" },
    });
    mocks.getChannel.mockReturnValue(undefined);

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure("del_1");

    expect(mocks.getChannel).toHaveBeenCalledWith("discord");
  });

  it("sends a failure notification with webhook, channel, error, and attempt context", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    mocks.findDelivery.mockResolvedValue(makeDelivery());
    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({
      id: "notify_channel",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://discord.test" },
    });
    mocks.getChannel.mockReturnValue({ send });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure("del_1");

    expect(send).toHaveBeenCalledWith(
      { webhookUrl: "https://discord.test" },
      {
        title: "Delivery failed",
        message: [
          "Webhook: Critical webhook",
          "Channel: Broken Slack (slack)",
          "Message: Main alert",
          "Error: boom",
          "Attempts: 5",
        ].join("\n"),
      },
      {
        channelId: "notify_channel",
        deliveryId: "del_1",
      }
    );
  });

  it("swallows errors from the failure channel itself", async () => {
    const send = vi.fn().mockRejectedValue(new Error("discord down"));

    mocks.findDelivery.mockResolvedValue(makeDelivery());
    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({
      id: "notify_channel",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://discord.test" },
    });
    mocks.getChannel.mockReturnValue({ send });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await expect(notifyFailure("del_1")).resolves.toBeUndefined();
  });

  it("uses 'Unknown' when the failed delivery has no lastError", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    mocks.findDelivery.mockResolvedValue(makeDelivery({ lastError: null }));
    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({
      id: "notify_channel",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://discord.test" },
    });
    mocks.getChannel.mockReturnValue({ send });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure("del_1");

    expect(send.mock.calls[0][1].message).toContain("Error: Unknown");
  });
});
