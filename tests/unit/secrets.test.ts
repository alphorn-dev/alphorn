import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import {
  decryptJson,
  encryptJson,
  EncryptionKeyMissingError,
  isEncryptedJson,
} from "@/lib/crypto/secrets";

const setKey = (key?: string) => {
  if (key === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = key;
};
const newKey = () => randomBytes(32).toString("base64");

afterEach(() => setKey(undefined));

describe("secrets", () => {
  const config = { botToken: "123:secret", chatId: "42" };

  it("stores plaintext when no key is set", () => {
    expect(encryptJson(config)).toEqual(config);
    expect(decryptJson(config)).toEqual(config);
  });

  it("round-trips with a key and hides the plaintext", () => {
    setKey(newKey());
    const stored = encryptJson(config);
    expect(isEncryptedJson(stored)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain("secret");
    expect(decryptJson(stored)).toEqual(config);
  });

  it("uses a fresh IV per encryption", () => {
    setKey(newKey());
    expect(encryptJson(config)).not.toEqual(encryptJson(config));
  });

  it("still reads plaintext rows after a key is set", () => {
    setKey(newKey());
    expect(decryptJson(config)).toEqual(config);
  });

  it("fails clearly when the key is missing for encrypted data", () => {
    setKey(newKey());
    const stored = encryptJson(config);
    setKey(undefined);
    expect(() => decryptJson(stored)).toThrow(EncryptionKeyMissingError);
  });

  it("rejects a wrong key instead of returning garbage", () => {
    setKey(newKey());
    const stored = encryptJson(config);
    setKey(newKey());
    expect(() => decryptJson(stored)).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    setKey("too-short");
    expect(() => encryptJson(config)).toThrow(/32 random bytes/);
  });
});
