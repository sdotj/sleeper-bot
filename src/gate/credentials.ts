import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for the single predetermined login (dec.api-auth-gate).
 *
 * We store a **scrypt** hash, never the raw password: a leaked env/secret then
 * yields only a slow-to-brute hash, not a reusable credential. The encoded
 * string carries its own parameters and salt so verification is self-describing:
 *
 *   scrypt$<N>$<r>$<p>$<salt-hex>$<hash-hex>
 */

const N = 16384; // CPU/memory cost (2^14)
const R = 8;
const P = 1;
const KEYLEN = 64;

/** Hash a plaintext password into the self-describing encoded form above. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Constant-time check of a plaintext password against an encoded hash. Returns
 * false (never throws) on any malformed input so callers can treat it as a plain
 * boolean gate.
 */
export function verifyPassword(password: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
    if (expected.length === 0) return false;
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, { N: n, r, p });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Constant-time string equality (used for the username, which is not secret but shouldn't leak via timing). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
