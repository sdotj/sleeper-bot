import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for secrets stored in the DB (dec.ui-config-editing).
 *
 * Values a user edits from the UI that must NOT sit in the database in the clear
 * — today just the Sleeper write token — are sealed with AES-256-GCM under a key
 * from `SLEEPBOT_SECRET_KEY` (a bootstrap secret, never itself UI-editable). A
 * DB dump alone therefore can't reveal the token; you also need the key, which
 * lives in the environment / Secret Manager.
 *
 * When the key is unset, {@link secretsEnabled} is false and storing secrets is
 * disabled (the token field goes read-only, the app falls back to env) — the
 * same degrade-when-unset posture as the login gate.
 */

const KEY_ENV = "SLEEPBOT_SECRET_KEY";

/** Parse the 32-byte key from `SLEEPBOT_SECRET_KEY` (64 hex chars, or base64). */
function loadKey(): Buffer | null {
  const raw = process.env[KEY_ENV]?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  return null;
}

/** True when a valid 32-byte `SLEEPBOT_SECRET_KEY` is configured. */
export function secretsEnabled(): boolean {
  return loadKey() !== null;
}

/** Seal a plaintext into `v1:<iv>:<tag>:<ciphertext>` (each part base64). Throws if no key. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  if (!key) throw new Error(`${KEY_ENV} is not set (want 32 bytes as 64 hex chars or base64) — cannot store secrets`);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Open a value produced by {@link encryptSecret}. Throws on a wrong key, tamper, or malformed input. */
export function decryptSecret(encoded: string): string {
  const key = loadKey();
  if (!key) throw new Error(`${KEY_ENV} is not set — cannot read stored secrets`);
  const parts = encoded.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("malformed encrypted secret");
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
