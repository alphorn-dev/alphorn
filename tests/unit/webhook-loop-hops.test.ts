import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetKeyCacheForTests,
  getMaxHops,
  signTrace,
  verifyTrace,
} from "@/lib/webhook-loop/hops";

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-hops-tests";
  __resetKeyCacheForTests();
});

describe("webhook-loop hops sign/verify", () => {
  it("round-trips a trace through sign + verify", () => {
    const trace = ["pub_a", "pub_b"];
    expect(verifyTrace(signTrace(trace))).toEqual(trace);
  });

  it("verifyTrace returns null for missing or malformed tokens", () => {
    expect(verifyTrace(undefined)).toBeNull();
    expect(verifyTrace("")).toBeNull();
    expect(verifyTrace("only-one-part")).toBeNull();
    expect(verifyTrace("a.b.c")).toBeNull();
  });

  it("verifyTrace rejects a tampered payload", () => {
    const token = signTrace(["pub_a"]);
    const [, sig] = token.split(".");
    const tampered = `${Buffer.from(JSON.stringify(["pub_EVIL"])).toString("base64url")}.${sig}`;
    expect(verifyTrace(tampered)).toBeNull();
  });

  it("verifyTrace rejects a token signed with a different secret", () => {
    process.env.BETTER_AUTH_SECRET = "secret-A";
    __resetKeyCacheForTests();
    const token = signTrace(["pub_a"]);

    process.env.BETTER_AUTH_SECRET = "secret-B";
    __resetKeyCacheForTests();
    expect(verifyTrace(token)).toBeNull();
  });

  it("getMaxHops honors the WEBHOOK_MAX_HOPS env, defaulting to 3", () => {
    delete process.env.WEBHOOK_MAX_HOPS;
    expect(getMaxHops()).toBe(3);

    process.env.WEBHOOK_MAX_HOPS = "7";
    expect(getMaxHops()).toBe(7);

    process.env.WEBHOOK_MAX_HOPS = "garbage";
    expect(getMaxHops()).toBe(3);

    delete process.env.WEBHOOK_MAX_HOPS;
  });
});
