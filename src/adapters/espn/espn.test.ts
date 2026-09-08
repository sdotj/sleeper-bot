import { describe, expect, it } from "vitest";
import { EspnAdapter, EspnUnsupportedError } from "./EspnAdapter.js";
import type { EspnApi, EspnLeague, EspnPlayer } from "./espnClient.js";

const player = (id: number, fullName: string, pos: number, proTeam: number): EspnPlayer => ({
  id,
  fullName,
  defaultPositionId: pos,
  proTeamId: proTeam,
});
const entry = (slot: number, p: EspnPlayer) => ({ lineupSlotId: slot, playerId: p.id, playerPoolEntry: { player: p } });

const LEAGUE: EspnLeague = {
  id: 42,
  seasonId: 2025,
  status: { currentMatchupPeriod: 11 },
  settings: {
    name: "Test League",
    size: 2,
    rosterSettings: { lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "23": 1, "16": 1, "17": 1, "20": 5, "21": 1 } },
    scoringSettings: { scoringItems: [{ statId: 53, points: 1 }] }, // full PPR
  },
  members: [
    { id: "{ME}", displayName: "Sam" },
    { id: "{RIVAL}", displayName: "Dana" },
  ],
  teams: [
    {
      id: 1,
      location: "Pre-Ja'Marrital",
      nickname: "Sex",
      owners: ["{ME}"],
      record: { overall: { wins: 7, losses: 3, ties: 0, pointsFor: 1200.5, pointsAgainst: 1100 } },
      roster: {
        entries: [
          entry(0, player(1, "Caleb Williams", 1, 3)), // QB CHI, starter
          entry(2, player(2, "Bijan Robinson", 2, 1)), // RB ATL, starter
          entry(20, player(3, "Rome Odunze", 3, 3)), // WR CHI, bench
          entry(21, player(4, "Puka Nacua", 3, 14)), // WR LAR, IR
        ],
      },
    },
    {
      id: 2,
      name: "Kelce Cartel",
      owners: ["{RIVAL}"],
      record: { overall: { wins: 8, losses: 2, ties: 0, pointsFor: 1250, pointsAgainst: 1000 } },
      roster: { entries: [entry(0, player(5, "Josh Allen", 1, 2))] },
    },
  ],
  schedule: [
    {
      id: 100,
      matchupPeriodId: 11,
      home: { teamId: 1, totalPoints: 118.4, rosterForCurrentScoringPeriod: { entries: [entry(0, player(1, "Caleb Williams", 1, 3))] } },
      away: { teamId: 2, totalPoints: 102.1 },
    },
    { id: 101, matchupPeriodId: 12, home: { teamId: 1, totalPoints: 0 }, away: { teamId: 2, totalPoints: 0 } },
  ],
  transactions: [
    {
      id: "t1",
      type: "WAIVER",
      status: "EXECUTED",
      scoringPeriodId: 11,
      bidAmount: 14,
      proposedDate: 1_699_999_999,
      items: [
        { type: "ADD", playerId: 999, toTeamId: 1 },
        { type: "DROP", playerId: 888, fromTeamId: 1 },
      ],
    },
  ],
};

const POOL: EspnPlayer[] = [
  { id: 999, fullName: "Jaylen Wright", defaultPositionId: 2, proTeamId: 15, ownership: { percentChange: 12 } },
  { id: 888, fullName: "Aging Vet", defaultPositionId: 3, proTeamId: 0, ownership: { percentChange: -8 } },
];

const fakeApi: EspnApi = { getLeague: async () => LEAGUE, getPlayers: async () => POOL };
const adapter = (swid?: string) => new EspnAdapter("42", "2025", fakeApi, swid);

describe("EspnAdapter", () => {
  it("normalizes rosters, flags your team by SWID, and maps positions/teams", async () => {
    const rosters = await adapter("{me}").getRosters(); // lowercase SWID -> case-insensitive
    const mine = rosters.find((r) => r.rosterId === 1)!;
    expect(mine.isYou).toBe(true);
    expect(mine.ownerName).toBe("Pre-Ja'Marrital Sex");
    expect(mine.wins).toBe(7);
    expect(mine.pointsFor).toBe(1200.5);
    expect(mine.starters.map((p) => `${p.position} ${p.name} ${p.team}`)).toEqual([
      "QB Caleb Williams CHI",
      "RB Bijan Robinson ATL",
    ]);
    expect(mine.bench.map((p) => p.name)).toEqual(["Rome Odunze"]);
    expect(mine.reserve.map((p) => p.name)).toEqual(["Puka Nacua"]); // IR
    expect(rosters.find((r) => r.rosterId === 2)!.isYou).toBe(false);
  });

  it("ranks standings by wins then points-for", async () => {
    const s = await adapter("{ME}").getStandings();
    expect(s.map((r) => [r.rank, r.rosterId])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(s.find((r) => r.rosterId === 1)!.isYou).toBe(true);
  });

  it("builds two matchup sides for the current week", async () => {
    const m = await adapter("{ME}").getMatchups();
    expect(m).toHaveLength(2);
    const me = m.find((x) => x.rosterId === 1)!;
    expect(me.isYou).toBe(true);
    expect(me.points).toBe(118.4);
    expect(me.matchupId).toBe(100);
    expect(me.starters[0].name).toBe("Caleb Williams");
    expect(m.find((x) => x.rosterId === 2)!.ownerName).toBe("Kelce Cartel");
  });

  it("reads league info (scoring type, size, roster slots)", async () => {
    const info = await adapter().getLeagueInfo();
    expect(info.name).toBe("Test League");
    expect(info.scoringType).toBe("ppr");
    expect(info.totalRosters).toBe(2);
    expect(info.rosterPositions.filter((p) => p === "RB")).toHaveLength(2);
    expect(info.rosterPositions).toContain("FLEX");
    expect(info.rosterPositions).toContain("IR");
  });

  it("searches the player pool and approximates trending from ownership change", async () => {
    const found = await adapter().searchPlayers("wright");
    expect(found).toEqual([expect.objectContaining({ fullName: "Jaylen Wright", position: "RB", team: "MIA" })]);
    const adds = await adapter().getTrendingPlayers("add");
    expect(adds[0].player.fullName).toBe("Jaylen Wright");
    expect(adds[0].count).toBe(12);
    const drops = await adapter().getTrendingPlayers("drop");
    expect(drops[0].player.fullName).toBe("Aging Vet");
  });

  it("normalizes transactions (adds/drops/faab)", async () => {
    const [t] = await adapter().getTransactions(11);
    expect(t.type).toBe("waiver");
    expect(t.adds).toEqual({ "999": 1 });
    expect(t.drops).toEqual({ "888": 1 });
    expect(t.faabBid).toBe(14);
    expect(t.rosterIds).toEqual([1]);
  });

  it("returns my roster and reports writes as unsupported (not a lapsed credential)", async () => {
    expect((await adapter("{ME}").getMyRoster())!.rosterId).toBe(1);
    expect(await adapter().getMyRoster()).toBeNull(); // no SWID
    expect(adapter().writeAuthStatus().state).toBe("unsupported");
    expect(adapter().capabilities).toEqual({ write: false, draft: false });
  });

  it("throws a clear error for unsupported drafts and writes", async () => {
    await expect(adapter().listDrafts()).rejects.toThrow(EspnUnsupportedError);
    await expect(
      adapter().executeAddDrop({ rosterId: 1, addPlayerId: "999" }),
    ).rejects.toThrow(/not supported on ESPN/);
  });
});
