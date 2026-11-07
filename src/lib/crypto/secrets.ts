import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * At-rest encryption for secrets stored in the database (channel credentials
 * today). Optional: without ENCRYPTION_KEY values are stored as plaintext, so
 * self-hosting stays zero-config. Once the key is set, new writes are
 * encrypted and encryptExistingSecrets() converts old rows at startup.
 *
 * AES-256-GCM, format "v1.<base64(iv | authTag | ciphertext)>". The version
 * prefix leaves room for key rotation later.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** JSON marker for an encrypted value; any other object is plaintext. */
export const ENCRYPTED_KEY = "$enc";

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super(
      "Data is encrypted but ENCRYPTION_KEY is not set. Restore the key it was encrypted with.",
    );
    this.name = "EncryptionKeyMissingError";
  }
}

function encryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 random bytes, base64-encoded (generate with: openssl rand -base64 32)",
    );
  }
  return key;
}

export function isEncryptionEnabled(): boolean {
  return encryptionKey() !== null;
}

export function encryptString(plaintext: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("ENCRYPTION_KEY is not set");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

export function decryptString(value: string): string {
  const key = encryptionKey();
  if (!key) throw new EncryptionKeyMissingError();
  const [version, payload] = value.split(".", 2);
  if (version !== VERSION || !payload) throw new Error("Unsupported encrypted value format");
  const data = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, IV_BYTES));
  decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  // Throws on a wrong key or tampered data (GCM auth tag mismatch).
  return Buffer.concat([
    decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedJson(value: unknown): value is { [ENCRYPTED_KEY]: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)[ENCRYPTED_KEY] === "string"
  );
}

/** Value to store in a Json column: encrypted when a key is set, else as-is. */
export function encryptJson<T>(value: T): T | { [ENCRYPTED_KEY]: string } {
  if (!isEncryptionEnabled()) return value;
  return { [ENCRYPTED_KEY]: encryptString(JSON.stringify(value)) };
}

/** Read a Json column written by encryptJson (plaintext passes through). */
export function decryptJson(stored: unknown): unknown {
  return isEncryptedJson(stored) ? JSON.parse(decryptString(stored[ENCRYPTED_KEY])) : stored;
}
