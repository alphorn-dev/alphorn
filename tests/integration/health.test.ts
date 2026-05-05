import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
  });

  it("returns 200 with status ok when the database is reachable", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok", version: "dev" });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it("returns 503 when the database query fails", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("db down"));

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      message: "database unreachable",
      version: "dev",
    });
  });
});
