import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "@/lib/http/client-ip";

afterEach(() => vi.unstubAllEnvs());

describe("clientIp", () => {
  it("ignores spoofed left-most X-Forwarded-For entries", () => {
    // Client sent "1.1.1.1", the proxy appended the real client 203.0.113.7.
    expect(clientIp("1.1.1.1, 203.0.113.7", null)).toBe("203.0.113.7");
  });

  it("skips TRUSTED_PROXIES from the right", () => {
    vi.stubEnv("TRUSTED_PROXIES", "10.0.0.0/8, 192.168.1.5");
    expect(clientIp("1.1.1.1, 203.0.113.7, 192.168.1.5, 10.1.2.3", null)).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP, the socket and finally 'unknown'", () => {
    vi.stubEnv("TRUSTED_PROXIES", "10.0.0.0/8");
    expect(clientIp("10.0.0.1", "198.51.100.2")).toBe("198.51.100.2");
    expect(clientIp(null, null, "198.51.100.3")).toBe("198.51.100.3");
    expect(clientIp(undefined, undefined)).toBe("unknown");
  });

  it("supports IPv6 proxies", () => {
    vi.stubEnv("TRUSTED_PROXIES", "fd00::/8");
    expect(clientIp("2001:db8::1, fd00::1", null)).toBe("2001:db8::1");
  });
});
