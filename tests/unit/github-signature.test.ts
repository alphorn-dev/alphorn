import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyGithubSignature } from "@/lib/github/app";

const SECRET = "gh_test_secret";
const body = '{"action":"opened"}';
const sign = (b: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(b).digest("hex")}`;

describe("verifyGithubSignature", () => {
  it("accepts a valid signature", () => {
    expect(verifyGithubSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyGithubSignature(body, sign(body, "other"), SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(verifyGithubSignature(body + " ", sign(body), SECRET)).toBe(false);
  });

  it("rejects a missing, unprefixed or truncated header", () => {
    expect(verifyGithubSignature(body, null, SECRET)).toBe(false);
    expect(verifyGithubSignature(body, sign(body).slice(7), SECRET)).toBe(false);
    expect(verifyGithubSignature(body, sign(body).slice(0, 20), SECRET)).toBe(false);
  });
});
