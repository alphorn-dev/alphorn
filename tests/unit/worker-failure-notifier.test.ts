import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSettings: vi.fn(),
  findChannel: vi.fn(),
  getChannel: vi.fn(),
  loggerChild: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
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
    mocks.findSettings.mockReset();
    mocks.findChannel.mockReset();
    mocks.getChannel.mockReset();
  });

  it("returns when no failure notification channel is configured", async () => {
    mocks.findSettings.mockResolvedValue(null);

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure(makeDelivery());

    expect(mocks.findChannel).not.toHaveBeenCalled();
  });

  it("avoids infinite loops when the failed channel is the failure channel", async () => {
    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "failed_channel",
    });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure(makeDelivery());

    expect(mocks.findChannel).not.toHaveBeenCalled();
  });

  it("returns when the failure channel is disabled or missing", async () => {
    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({ id: "notify_channel", enabled: false });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure(makeDelivery());

    expect(mocks.getChannel).not.toHaveBeenCalled();
  });

  it("returns when there is no handler for the failure channel type", async () => {
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
    await notifyFailure(makeDelivery());

    expect(mocks.getChannel).toHaveBeenCalledWith("discord");
  });

  it("sends a failure notification with webhook, channel, error, and attempt context", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({
      id: "notify_channel",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://discord.test" },
    });
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure(makeDelivery());

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

  it("parses the failure channel config before sending", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    // A schema that injects a default the raw config lacks — send must receive
    // the parsed value, proving parse runs before send.
    const configSchema = {
      parse: (c: Record<string, unknown>) => ({ ...c, priority: 5 }),
    };

    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({
      id: "notify_channel",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://discord.test" },
    });
    mocks.getChannel.mockReturnValue({ configSchema, send });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure(makeDelivery());

    expect(send.mock.calls[0][0]).toEqual({
      webhookUrl: "https://discord.test",
      priority: 5,
    });
  });

  it("swallows errors from the failure channel itself", async () => {
    const send = vi.fn().mockRejectedValue(new Error("discord down"));

    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({
      id: "notify_channel",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://discord.test" },
    });
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await expect(notifyFailure(makeDelivery())).resolves.toBeUndefined();
  });

  it("uses 'Unknown' when the failed delivery has no lastError", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    mocks.findSettings.mockResolvedValue({
      failureNotificationChannelId: "notify_channel",
    });
    mocks.findChannel.mockResolvedValue({
      id: "notify_channel",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://discord.test" },
    });
    mocks.getChannel.mockReturnValue({ configSchema: { parse: (c: unknown) => c }, send });

    const { notifyFailure } = await import("@/worker/failure-notifier");
    await notifyFailure(makeDelivery({ lastError: null }));

    expect(send.mock.calls[0][1].message).toContain("Error: Unknown");
  });
});
