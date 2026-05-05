import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sentryTrace: vi.fn(),
  sentryDebug: vi.fn(),
  sentryInfo: vi.fn(),
  sentryWarn: vi.fn(),
  sentryError: vi.fn(),
  sentryFatal: vi.fn(),
  pinoTrace: vi.fn(),
  pinoDebug: vi.fn(),
  pinoInfo: vi.fn(),
  pinoWarn: vi.fn(),
  pinoError: vi.fn(),
  pinoFatal: vi.fn(),
  pinoChild: vi.fn(),
}));

function makePinoLogger() {
  return {
    trace: mocks.pinoTrace,
    debug: mocks.pinoDebug,
    info: mocks.pinoInfo,
    warn: mocks.pinoWarn,
    error: mocks.pinoError,
    fatal: mocks.pinoFatal,
    child: mocks.pinoChild,
  };
}

vi.mock("@sentry/nextjs", () => ({
  logger: {
    trace: mocks.sentryTrace,
    debug: mocks.sentryDebug,
    info: mocks.sentryInfo,
    warn: mocks.sentryWarn,
    error: mocks.sentryError,
    fatal: mocks.sentryFatal,
  },
}));

vi.mock("pino", () => {
  const root = makePinoLogger();
  mocks.pinoChild.mockImplementation(() => makePinoLogger());
  return {
    default: vi.fn(() => root),
  };
});

describe("logger", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.pinoChild.mockImplementation(() => makePinoLogger());
  });

  it("forwards string logs to pino and sentry with inherited bindings", async () => {
    const { logger } = await import("@/lib/logger");

    const child = logger.child({ component: "worker", deliveryId: 123 });
    child.info("Delivery succeeded");

    expect(mocks.pinoChild).toHaveBeenCalledWith({ component: "worker", deliveryId: 123 });
    expect(mocks.sentryInfo).toHaveBeenCalledWith("Delivery succeeded", {
      component: "worker",
      deliveryId: "123",
    });
  });

  it("forwards object logs and merges child bindings into sentry attrs", async () => {
    const { logger } = await import("@/lib/logger");

    const child = logger.child({ component: "webhook" });
    child.error({ status: 503, retryable: false }, "Delivery failed");

    expect(mocks.sentryError).toHaveBeenCalledWith("Delivery failed", {
      component: "webhook",
      status: "503",
      retryable: "false",
    });
  });

  it("does not throw if sentry forwarding fails", async () => {
    mocks.sentryWarn.mockImplementation(() => {
      throw new Error("sentry offline");
    });

    const { logger } = await import("@/lib/logger");

    expect(() => logger.warn("still log locally")).not.toThrow();
    expect(mocks.pinoWarn).toHaveBeenCalledWith("still log locally");
  });

  it("skips sentry forwarding when the level function is missing", async () => {
    const { logger } = await import("@/lib/logger");
    mocks.sentryFatal.mockImplementation(undefined as never);

    expect(() => logger.fatal("fatal path")).not.toThrow();
    expect(mocks.pinoFatal).toHaveBeenCalledWith("fatal path");
  });

  it("uses an empty string when object logging is called without a message", async () => {
    const { logger } = await import("@/lib/logger");

    (logger.info as unknown as (obj: Record<string, unknown>) => void)({ state: "ok" });

    expect(mocks.sentryInfo).toHaveBeenCalledWith("", { state: "ok" });
  });
});
