import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * Encryption for secrets kept in the database, such as a pharmacy's OpenAI
 * API key: AES-256-GCM with a key derived from ENCRYPTION_SECRET. Changing
 * that secret makes the stored values unreadable (they must be entered again).
 */

const VERSION = "v1";

export class MissingEncryptionSecretError extends Error {
  constructor() {
    super("ENCRYPTION_SECRET is not set");
  }
}

function key(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new MissingEncryptionSecretError();
    return createHash("sha256").update("stockyaa-dev-encryption-do-not-use-in-production").digest();
  }
  return createHash("sha256").update(secret).digest();
}

/** "v1:<iv>:<tag>:<ciphertext>", the last three base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, ...[iv, cipher.getAuthTag(), data].map((p) => p.toString("base64"))].join(":");
}

/** The plain text, or null when the value cannot be decrypted (e.g. the secret changed). */
export function decryptSecret(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
