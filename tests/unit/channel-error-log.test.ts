import { describe, expect, it } from "vitest";
import { errorLogFields, isExternalDeliveryError, PermanentChannelError, throwIfNotOk } from "@/channels/errors";

describe("errorLogFields", () => {
  it("keeps status and codes but never the provider's message", async () => {
    const res = new Response("550 rejected: alice@example.com said hi", { status: 400 });
    const err = await throwIfNotOk(res, "Webhook").catch((e: unknown) => e);
    const fields = errorLogFields(err);
    expect(fields).toEqual({ errorName: "PermanentChannelError", status: 400 });
    expect(JSON.stringify(fields)).not.toContain("alice@example.com");
  });

  it("keeps SMTP codes", () => {
    const smtp = Object.assign(new Error("550 5.1.1 <bob@example.com>: unknown user"), {
      code: "EENVELOPE",
      responseCode: 550,
    });
    expect(errorLogFields(smtp)).toEqual({ errorName: "Error", code: "EENVELOPE", responseCode: 550 });
  });
});

describe("isExternalDeliveryError", () => {
  it("treats target-side failures as external", () => {
    expect(isExternalDeliveryError(new PermanentChannelError("401"))).toBe(true);
    expect(isExternalDeliveryError(Object.assign(new Error("503"), { status: 503 }))).toBe(true);
    expect(isExternalDeliveryError(Object.assign(new Error("smtp"), { responseCode: 550 }))).toBe(true);
    expect(isExternalDeliveryError(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }))).toBe(true);
    expect(isExternalDeliveryError(new DOMException("timed out", "TimeoutError"))).toBe(true);
  });

  it("keeps bugs in our own code loud", () => {
    expect(isExternalDeliveryError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isExternalDeliveryError(new Error("boom"))).toBe(false);
  });
});
