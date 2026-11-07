import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  constructor: vi.fn(),
  on: vi.fn(),
}));

vi.mock("pg-boss", () => ({
  PgBoss: class MockPgBoss {
    constructor(options: unknown) {
      mocks.constructor(options);
    }

    async start() {
      return mocks.start();
    }

    on(event: string, listener: unknown) {
      mocks.on(event, listener);
    }
  },
}));

describe("getQueue", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    mocks.constructor.mockReset();
    mocks.on.mockReset();
    vi.resetModules();
    delete (globalThis as { pgBoss?: unknown }).pgBoss;
    delete (globalThis as { pgBossStarted?: boolean }).pgBossStarted;
    process.env.DATABASE_URL = "postgres://notifex:test@localhost:5432/notifex";
  });

  it("creates and starts the pg-boss singleton only once", async () => {
    const { getQueue } = await import("@/lib/queue");

    const first = await getQueue();
    const second = await getQueue();

    expect(first).toBe(second);
    expect(mocks.constructor).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it("registers an error listener so pg-boss errors don't kill the worker loop", async () => {
    const { getQueue } = await import("@/lib/queue");
    await getQueue();
    expect(mocks.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});
