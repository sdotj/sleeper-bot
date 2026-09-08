import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRulesConfig } from "./schema.js";

const savedEnv = { ...process.env };
const dir = mkdtempSync(join(tmpdir(), "sleepbot-rules-"));

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("loadRulesConfig (fail-closed guardrails, audit #5)", () => {
  it("loads and validates an inline SLEEPBOT_RULES_JSON seed (cloud path)", async () => {
    process.env.SLEEPBOT_RULES_JSON = JSON.stringify({
      mode: "auto",
      protect: [{ playerName: "Ja'Marr Chase" }],
    });
    const cfg = await loadRulesConfig();
    expect(cfg.mode).toBe("auto");
    expect(cfg.protect).toHaveLength(1);
  });

  it("throws when an EXPLICIT rules path cannot be read (does not silently drop rules)", async () => {
    delete process.env.SLEEPBOT_RULES_JSON;
    await expect(loadRulesConfig(join(dir, "missing.json"))).rejects.toThrow(/could not read rules config/);
  });

  it("throws when the configured path is a directory, not a file", async () => {
    delete process.env.SLEEPBOT_RULES_JSON;
    await expect(loadRulesConfig(dir)).rejects.toThrow(/could not read rules config/);
  });

  it("throws on corrupt JSON", async () => {
    delete process.env.SLEEPBOT_RULES_JSON;
    const f = join(dir, "corrupt.json");
    writeFileSync(f, "{ not json");
    await expect(loadRulesConfig(f)).rejects.toThrow(/not valid JSON/);
  });

  it("throws on a schema violation", async () => {
    delete process.env.SLEEPBOT_RULES_JSON;
    const f = join(dir, "bad-schema.json");
    writeFileSync(f, JSON.stringify({ mode: "sometimes" }));
    await expect(loadRulesConfig(f)).rejects.toThrow(/invalid rules config/);
  });

  it("loads a valid explicit file", async () => {
    delete process.env.SLEEPBOT_RULES_JSON;
    const f = join(dir, "good.json");
    writeFileSync(f, JSON.stringify({ mode: "manual", protect: [{ playerId: "4046" }] }));
    const cfg = await loadRulesConfig(f);
    expect(cfg.mode).toBe("manual");
    expect(cfg.protect[0].playerId).toBe("4046");
  });
});
