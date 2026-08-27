import { describe, expect, it } from "vitest";
import { GenericValueProvider } from "../value/genericValueProvider.js";
import { RulesEngine, type RuleContext } from "./engine.js";
import { rulesConfigSchema } from "./schema.js";

const engine = (cfg: unknown) => new RulesEngine(rulesConfigSchema.parse(cfg));
const ctx: RuleContext = {
  names: new Map([
    ["star", "Ja'Marr Chase"],
    ["scrub", "Backup Guy"],
  ]),
  value: new GenericValueProvider({ star: 90, scrub: 20 }),
};

describe("RulesEngine protect rules", () => {
  it("blocks trading away a protected player (by name)", async () => {
    const v = await engine({ protect: [{ playerName: "Ja'Marr Chase" }] }).evaluate(
      "trade",
      { fromRosterId: 1, toRosterId: 2, sendPlayerIds: ["star"], receivePlayerIds: ["scrub"] },
      ctx,
    );
    expect(v.decision).toBe("block");
    expect(v.blockedReasons[0]).toMatch(/Ja'Marr Chase.*traded away/);
  });

  it("allows a trade that does not move the protected player", async () => {
    const v = await engine({ protect: [{ playerName: "Ja'Marr Chase" }] }).evaluate(
      "trade",
      { fromRosterId: 1, toRosterId: 2, sendPlayerIds: ["scrub"], receivePlayerIds: ["star"] },
      ctx,
    );
    expect(v.decision).toBe("allow");
  });

  it("blocks dropping a protected player, and respects the actions filter", async () => {
    const blocked = await engine({ protect: [{ playerId: "star", actions: ["drop"] }] }).evaluate(
      "add_drop",
      { rosterId: 1, addPlayerId: "x", dropPlayerId: "star" },
      ctx,
    );
    expect(blocked.decision).toBe("block");

    // Same player protected only against "drop" — trading is still allowed.
    const allowed = await engine({ protect: [{ playerId: "star", actions: ["drop"] }] }).evaluate(
      "trade",
      { fromRosterId: 1, toRosterId: 2, sendPlayerIds: ["star"], receivePlayerIds: [] },
      ctx,
    );
    expect(allowed.decision).toBe("allow");
  });
});

describe("RulesEngine warn rules and mode", () => {
  it("warns on a lopsided trade without blocking", async () => {
    const v = await engine({ warn: [{ type: "trade_value_diff", thresholdPct: 20 }] }).evaluate(
      "trade",
      { fromRosterId: 1, toRosterId: 2, sendPlayerIds: ["star"], receivePlayerIds: ["scrub"] },
      ctx,
    );
    expect(v.decision).toBe("allow");
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]).toMatch(/differential/);
  });

  it("defaults to manual mode", () => {
    expect(engine({}).mode).toBe("manual");
    expect(engine({ mode: "auto" }).mode).toBe("auto");
  });
});
