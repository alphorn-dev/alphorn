import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { encryptJson, isEncryptionEnabled } from "./secrets";

const BATCH_SIZE = 500;

/**
 * Encrypt every plaintext Channel.config once ENCRYPTION_KEY is set. Runs on
 * every startup (web and worker) and is a cheap no-op once done. The update is
 * conditional on the row still being plaintext, so several instances starting
 * at once can't double-encrypt. Add new secret columns here when they appear.
 */
export async function encryptExistingSecrets(): Promise<void> {
  if (!isEncryptionEnabled()) {
    const encrypted = await prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM "Channel" WHERE "config" ? '$enc' LIMIT 1
    `;
    if (encrypted.length > 0) {
      logger.error(
        { component: "encryption" },
        "Channel configs are encrypted but ENCRYPTION_KEY is not set; deliveries will fail",
      );
    }
    return;
  }

  let total = 0;
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; config: unknown }[]>`
      SELECT "id", "config" FROM "Channel" WHERE NOT ("config" ? '$enc') LIMIT ${BATCH_SIZE}
    `;
    for (const row of rows) {
      total += await prisma.$executeRaw`
        UPDATE "Channel" SET "config" = ${JSON.stringify(encryptJson(row.config))}::jsonb
        WHERE "id" = ${row.id} AND NOT ("config" ? '$enc')
      `;
    }
    if (rows.length < BATCH_SIZE) break;
  }

  if (total > 0) {
    logger.info({ component: "encryption", count: total }, "Encrypted existing channel configs");
  }
}

/**
 * Startup hook. An invalid key fails startup right away (isEncryptionEnabled
 * throws); the DB pass runs in the background so a slow or briefly
 * unreachable DB doesn't block boot.
 */
export function startSecretEncryption(): void {
  isEncryptionEnabled();
  encryptExistingSecrets().catch((err) => {
    logger.error({ component: "encryption", err }, "Encrypting existing secrets failed");
  });
}
