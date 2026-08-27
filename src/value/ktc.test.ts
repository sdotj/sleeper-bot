import { describe, expect, it } from "vitest";
import { KtcValueProvider, nameKey, normalizeName, type KtcPlayer, type PlayerLite } from "./ktc.js";

describe("normalizeName", () => {
  it("lowercases, strips punctuation and generational suffixes", () => {
    expect(normalizeName("Ja'Marr Chase")).toBe("jamarr chase");
    expect(normalizeName("Michael Pittman Jr.")).toBe("michael pittman");
    expect(normalizeName("Kenneth Walker III")).toBe("kenneth walker");
  });
  it("keys by normalized name + position", () => {
    expect(nameKey("Ja'Marr Chase", "wr")).toBe("jamarr chase|WR");
  });
});

describe("KtcValueProvider", () => {
  const ktc: KtcPlayer[] = [
    { name: "Ja'Marr Chase", position: "WR", sf_value: 9968, oqb_value: 9000 },
    { name: "Justin Fields", position: "QB", sf_value: 1813, oqb_value: 1838 },
    { name: "Rookie Pick 2026", position: "RDP", sf_value: 5000 },
  ];
  const players: PlayerLite[] = [
    { playerId: "7564", name: "Ja'Marr Chase", position: "WR" },
    { playerId: "qb1", name: "Justin Fields", position: "QB" },
    { playerId: "unknown", name: "Practice Squad Guy", position: "WR" },
  ];
  const load = async () => players;

  it("bridges KTC values to Sleeper ids by name+position (superflex)", async () => {
    const vp = new KtcValueProvider(ktc, load, { mode: "sf" });
    expect(await vp.getValue("7564")).toBe(9968);
    expect(await vp.getValue("qb1")).toBe(1813);
    expect(await vp.getValue("unknown")).toBe(0); // not in KTC -> neutral
  });

  it("honors 1-QB mode and skips rookie draft picks", async () => {
    const vp = new KtcValueProvider(ktc, load, { mode: "oqb" });
    const map = await vp.getValues(["7564", "qb1"]);
    expect(map.get("7564")).toBe(9000);
    expect(map.get("qb1")).toBe(1838);
  });

  it("builds the index only once (memoized)", async () => {
    let calls = 0;
    const vp = new KtcValueProvider(ktc, async () => {
      calls++;
      return players;
    });
    await vp.getValue("7564");
    await vp.getValues(["qb1"]);
    expect(calls).toBe(1);
  });
});
