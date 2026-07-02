import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("Auth protection", () => {
  it("redirects unauthenticated dashboard requests to sign-in", () => {
    const req = new NextRequest("https://notifex.test/webhooks");

    const res = proxy(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://notifex.test/sign-in?redirect=%2Fwebhooks"
    );
  });

  it("allows public paths without auth and forwards the pathname header", () => {
    const req = new NextRequest("https://notifex.test/api/health");

    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-pathname")).toBe("/api/health");
  });

  it("treats the invitation acceptance page as public", () => {
    const req = new NextRequest("https://notifex.test/accept-invitation/inv123");

    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-pathname")).toBe("/accept-invitation/inv123");
  });

  it("treats Better Auth API routes as public", () => {
    const req = new NextRequest("https://notifex.test/api/auth/get-session");

    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-pathname")).toBe("/api/auth/get-session");
  });

  it("allows authenticated requests with the regular session cookie", () => {
    const req = new NextRequest("https://notifex.test/webhooks", {
      headers: {
        cookie: "better-auth.session_token=session123",
      },
    });

    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-pathname")).toBe("/webhooks");
  });

  it("allows authenticated requests with the secure session cookie", () => {
    const req = new NextRequest("https://notifex.test/webhooks", {
      headers: {
        cookie: "__Secure-better-auth.session_token=session123",
      },
    });

    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-pathname")).toBe("/webhooks");
  });
});
