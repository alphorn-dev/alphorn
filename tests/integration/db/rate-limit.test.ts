import { describe, expect, it } from "vitest";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

describe("enforceRateLimit", () => {
  it("holds the cap under concurrent callers", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => enforceRateLimit("t:concurrent", 10, 60_000)),
    );
    const accepted = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof RateLimitError,
    ).length;
    expect(accepted).toBe(10);
    expect(rejected).toBe(15);
  });

  it("opens a new window once the last accepted request is old enough", async () => {
    await enforceRateLimit("t:window", 1, 50);
    await expect(enforceRateLimit("t:window", 1, 50)).rejects.toBeInstanceOf(RateLimitError);
    await new Promise((r) => setTimeout(r, 60));
    await expect(enforceRateLimit("t:window", 1, 50)).resolves.toBeUndefined();
  });
});
