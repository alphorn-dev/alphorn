import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { encryptExistingSecrets } from "@/lib/crypto/encrypt-existing";
import { decryptJson, isEncryptedJson } from "@/lib/crypto/secrets";

async function seedChannel(config: Record<string, string>) {
  const orgId = `org_${nanoid(10)}`;
  await prisma.organization.create({ data: { id: orgId, name: "Enc Org" } });
  return prisma.channel.create({
    data: {
      id: `ch_${nanoid(10)}`,
      name: "Enc channel",
      type: "telegram",
      config,
      publicId: nanoid(12),
      organizationId: orgId,
    },
  });
}

const storedConfig = async (id: string) =>
  (await prisma.channel.findUniqueOrThrow({ where: { id } })).config;

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("encryptExistingSecrets", () => {
  it("leaves plaintext alone while no key is set", async () => {
    const ch = await seedChannel({ botToken: "123:secret" });
    await encryptExistingSecrets();
    expect(await storedConfig(ch.id)).toEqual({ botToken: "123:secret" });
  });

  it("encrypts plaintext configs once a key is set, idempotently", async () => {
    const a = await seedChannel({ botToken: "123:secret" });
    const b = await seedChannel({ password: "hunter2" });
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");

    await encryptExistingSecrets();
    const first = await storedConfig(a.id);
    expect(isEncryptedJson(first)).toBe(true);
    expect(decryptJson(first)).toEqual({ botToken: "123:secret" });
    expect(decryptJson(await storedConfig(b.id))).toEqual({ password: "hunter2" });

    // A second run (another instance, next restart) must not re-encrypt.
    await encryptExistingSecrets();
    expect(await storedConfig(a.id)).toEqual(first);
  });
});
