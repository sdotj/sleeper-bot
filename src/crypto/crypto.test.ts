import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, secretsEnabled } from "./secretBox.js";

const KEY = "SLEEPBOT_SECRET_KEY";
const saved = process.env[KEY];
// A deterministic 32-byte key (64 hex chars) for the tests.
const HEX_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe("secretBox", () => {
  it("round-trips a secret with a hex key", () => {
    process.env[KEY] = HEX_KEY;
    const sealed = encryptSecret("eyJ.token.value");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("token.value"); // not stored in the clear
    expect(decryptSecret(sealed)).toBe("eyJ.token.value");
  });

  it("accepts a base64 32-byte key too", () => {
    process.env[KEY] = Buffer.from(HEX_KEY, "hex").toString("base64");
    expect(secretsEnabled()).toBe(true);
    expect(decryptSecret(encryptSecret("hi"))).toBe("hi");
  });

  it("secretsEnabled is false without a valid key", () => {
    delete process.env[KEY];
    expect(secretsEnabled()).toBe(false);
    process.env[KEY] = "too-short";
    expect(secretsEnabled()).toBe(false);
  });

  it("encrypt/decrypt throw when no key is set", () => {
    delete process.env[KEY];
    expect(() => encryptSecret("x")).toThrow(/SLEEPBOT_SECRET_KEY/);
    expect(() => decryptSecret("v1:a:b:c")).toThrow(/SLEEPBOT_SECRET_KEY/);
  });

  it("rejects a tampered ciphertext (GCM auth tag)", () => {
    process.env[KEY] = HEX_KEY;
    const sealed = encryptSecret("secret");
    const parts = sealed.split(":");
    const bad = Buffer.from(parts[3], "base64");
    bad[0] ^= 0xff; // flip a bit in the ciphertext
    parts[3] = bad.toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("fails to decrypt under a different key", () => {
    process.env[KEY] = HEX_KEY;
    const sealed = encryptSecret("secret");
    process.env[KEY] = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
    expect(() => decryptSecret(sealed)).toThrow();
  });
});
