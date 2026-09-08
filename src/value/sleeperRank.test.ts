import { describe, expect, it } from "vitest";
import { SleeperRankValueProvider, type RankedPlayer } from "./sleeperRank.js";

const players: RankedPlayer[] = [
  { playerId: "rb1", position: "RB", searchRank: 1 },
  { playerId: "rb50", position: "RB", searchRank: 50 },
  { playerId: "k1", position: "K", searchRank: 94 }, // kickers ARE ranked
  { playerId: "def1", position: "DEF", searchRank: null }, // defenses are not
  { playerId: "deep", position: "WR", searchRank: 9999999 }, // unranked skill
];

describe("SleeperRankValueProvider", () => {
  it("values by rank (lower rank = higher value), floors DEF, zeroes deep unranked", async () => {
    const vp = new SleeperRankValueProvider(async () => players);
    const v = await vp.getValues(players.map((p) => p.playerId));

    expect(v.get("rb1")!).toBeGreaterThan(v.get("rb50")!); // rank 1 beats rank 50
    expect(v.get("k1")!).toBeGreaterThan(0); // kicker is ranked and visible
    expect(v.get("def1")!).toBe(300); // defense floor, still visible
    expect(v.get("deep")!).toBe(0); // unranked non-DEF
  });

  it("retries after a failed build instead of caching the rejection (audit #15)", async () => {
    let calls = 0;
    const vp = new SleeperRankValueProvider(async () => {
      calls++;
      if (calls === 1) throw new Error("transient load failure");
      return players;
    });
    await expect(vp.getValue("rb1")).rejects.toThrow(/transient/);
    expect(await vp.getValue("rb1")).toBeGreaterThan(0); // second attempt succeeds
    expect(calls).toBe(2);
  });
});
