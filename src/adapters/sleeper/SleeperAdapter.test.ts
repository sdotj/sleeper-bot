import { describe, expect, it } from "vitest";
import type { SleeperApi, SleeperNflState, SleeperPlayer } from "./sleeperClient.js";
import { SleeperAdapter } from "./SleeperAdapter.js";

/**
 * A fake SleeperApi with canned responses — exercises the adapter's pure
 * normalization (name joins, bench derivation, points math, sort, isYou)
 * with no network and no players download.
 */
function fakeClient(): SleeperApi {
  const players: Record<string, SleeperPlayer> = {
    p1: { player_id: "p1", full_name: "Patrick Mahomes", position: "QB", team: "KC" },
    p2: { player_id: "p2", first_name: "Christian", last_name: "McCaffrey", position: "RB", team: "SF" },
    p3: { player_id: "p3", full_name: "Bench Guy", position: "WR", team: "NYJ" },
    p4: { player_id: "p4", full_name: "IR Guy", position: "TE", team: "BUF" },
  };
  return {
    getLeague: async () => ({
      name: "Test League",
      season: "2026",
      status: "in_season",
      total_rosters: 2,
      scoring_settings: { rec: 1 },
      roster_positions: ["QB", "RB", "WR", "BN"],
    }),
    getRosters: async () => [
      {
        roster_id: 1,
        owner_id: "u1",
        starters: ["p1", "p2"],
        players: ["p1", "p2", "p3", "p4"],
        reserve: ["p4"],
        settings: { wins: 2, losses: 1, fpts: 250, fpts_decimal: 55, fpts_against: 200, fpts_against_decimal: 10 },
      },
      {
        roster_id: 2,
        owner_id: "u2",
        starters: ["p1"],
        players: ["p1"],
        settings: { wins: 3, losses: 0, fpts: 100, fpts_decimal: 0 },
      },
    ],
    getUsers: async () => [
      { user_id: "u1", display_name: "sam", metadata: { team_name: "Sam's Team" } },
      { user_id: "u2", display_name: "rival" },
    ],
    getMatchups: async () => [
      { matchup_id: 1, roster_id: 1, points: 120.5, starters: ["p1", "p2"] },
      { matchup_id: 1, roster_id: 2, points: 99, starters: ["p1"] },
    ],
    getTransactions: async () => [],
    getTrending: async () => [{ player_id: "p1", count: 42 }],
    getNflState: async (): Promise<SleeperNflState> => ({
      week: 5,
      season: "2026",
      season_type: "regular",
      leg: 5,
    }),
    getUserByName: async (username: string) => (username === "sam" ? { user_id: "u1" } : null),
    getPlayers: async () => players,
  };
}

describe("SleeperAdapter normalization", () => {
  const adapter = () => new SleeperAdapter("L1", fakeClient(), "sam");

  it("resolves player ids to names, joining first/last when needed", async () => {
    const [r1] = await adapter().getRosters();
    expect(r1.starters.map((p) => p.name)).toEqual(["Patrick Mahomes", "Christian McCaffrey"]);
    expect(r1.starters[0]).toMatchObject({ position: "QB", team: "KC" });
  });

  it("derives bench as players minus starters/reserve/taxi", async () => {
    const [r1] = await adapter().getRosters();
    expect(r1.bench.map((p) => p.name)).toEqual(["Bench Guy"]);
    expect(r1.reserve.map((p) => p.name)).toEqual(["IR Guy"]);
    expect(r1.taxi).toEqual([]);
  });

  it("computes points as whole + decimal/100", async () => {
    const [r1] = await adapter().getRosters();
    expect(r1.pointsFor).toBeCloseTo(250.55, 2);
    expect(r1.pointsAgainst).toBeCloseTo(200.1, 2);
  });

  it("flags the configured user's roster via username -> user_id", async () => {
    const [r1, r2] = await adapter().getRosters();
    expect(r1.isYou).toBe(true);
    expect(r2.isYou).toBe(false);
    expect(r1.ownerName).toBe("Sam's Team");
  });

  it("sorts standings by wins then points-for and carries isYou", async () => {
    const standings = await adapter().getStandings();
    expect(standings.map((s) => s.rosterId)).toEqual([2, 1]); // rival 3-0 ranks above sam 2-1
    expect(standings[0]).toMatchObject({ rank: 1, isYou: false });
    expect(standings[1]).toMatchObject({ rank: 2, isYou: true });
  });

  it("resolves matchup starters and flags my side", async () => {
    const matchups = await adapter().getMatchups();
    const mine = matchups.find((m) => m.rosterId === 1)!;
    expect(mine.isYou).toBe(true);
    expect(mine.starters.map((p) => p.name)).toEqual(["Patrick Mahomes", "Christian McCaffrey"]);
    expect(matchups.find((m) => m.rosterId === 2)!.isYou).toBe(false);
  });

  it("infers ppr scoring from rec settings", async () => {
    expect((await adapter().getLeagueInfo()).scoringType).toBe("ppr");
  });

  it("getMyRoster returns the user's roster, or null with no username", async () => {
    expect((await adapter().getMyRoster())?.rosterId).toBe(1);
    const anon = new SleeperAdapter("L1", fakeClient());
    expect(await anon.getMyRoster()).toBeNull();
  });
});
