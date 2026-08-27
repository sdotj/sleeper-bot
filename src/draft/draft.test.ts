import { describe, expect, it } from "vitest";
import type { Draft, DraftPick, LeagueAdapter, Player } from "../adapters/LeagueAdapter.js";
import type { ValueProvider } from "../value/index.js";
import { DraftAssistant } from "./draftAssistant.js";

const draft: Draft = {
  draftId: "d1",
  leagueId: "L",
  status: "drafting",
  type: "snake",
  season: "2026",
  rounds: 16,
  teams: 12,
  slotToRosterId: { "1": 101, "2": 102, "12": 112 },
  starterSlots: { QB: 1, RB: 2, WR: 2, TE: 1 },
  startTimeMs: null,
  pickTimerSec: 90,
};

const pool: Player[] = [
  { playerId: "wr1", fullName: "Star WR", position: "WR", team: "CIN", status: null },
  { playerId: "rb1", fullName: "Star RB", position: "RB", team: "ATL", status: null },
  { playerId: "wr2", fullName: "Mid WR", position: "WR", team: "SF", status: null },
  { playerId: "qb1", fullName: "A QB", position: "QB", team: "KC", status: null },
];
const values = new Map([
  ["wr1", 9990],
  ["rb1", 9994],
  ["wr2", 4000],
  ["qb1", 1800],
]);

function assistant(picks: DraftPick[]) {
  const adapter = {
    getDraft: async () => draft,
    getDraftPicks: async () => picks,
    getDraftablePlayers: async () => pool,
  } as unknown as LeagueAdapter;
  const value: ValueProvider = {
    getValue: async (id) => values.get(id) ?? 0,
    getValues: async (ids) => new Map(ids.map((id) => [id, values.get(id) ?? 0])),
  };
  return new DraftAssistant({ adapterFor: () => adapter, value });
}

const pick = (over: Partial<DraftPick>): DraftPick => ({
  round: 1,
  pickNo: 1,
  slot: 1,
  rosterId: 101,
  playerId: "x",
  playerName: "X",
  position: "RB",
  team: null,
  pickedBy: null,
  isKeeper: false,
  ...over,
});

describe("DraftAssistant board (snake on-the-clock)", () => {
  it("first pick is slot 1, round 1", async () => {
    const board = await assistant([]).getBoard("L", "d1");
    expect(board.onTheClock).toMatchObject({ pickNo: 1, round: 2 - 1, slot: 1, rosterId: 101 });
  });

  it("snake-reverses in round 2", async () => {
    // 12 picks made -> next is pick 13 = round 2, slot 12 (reversed)
    const picks = Array.from({ length: 12 }, (_, i) => pick({ pickNo: i + 1 }));
    const board = await assistant(picks).getBoard("L", "d1");
    expect(board.onTheClock).toMatchObject({ pickNo: 13, round: 2, slot: 12, rosterId: 112 });
  });

  it("computes your next pick number from your slot", async () => {
    const board = await assistant([]).getBoard("L", "d1", { yourRosterId: 112 });
    expect(board.yourNextPickNo).toBe(12); // slot 12, round 1
  });
});

describe("DraftAssistant recommendations", () => {
  it("ranks available by value and excludes drafted players", async () => {
    const recs = await assistant([pick({ playerId: "rb1" })]).recommend("L", "d1");
    expect(recs.map((r) => r.playerId)).toEqual(["wr1", "wr2", "qb1"]); // rb1 taken; sorted by value
    expect(recs[0].value).toBe(9990);
  });

  it("filters by position and notes roster needs", async () => {
    // roster 101 already drafted an RB (starterSlots RB:2) -> still needs RB; WR:2 unmet too
    const recs = await assistant([pick({ playerId: "rb1", rosterId: 101, position: "RB" })]).recommend(
      "L",
      "d1",
      { rosterId: 101, position: "WR" },
    );
    expect(recs.every((r) => r.position === "WR")).toBe(true);
    expect(recs[0]).toMatchObject({ playerId: "wr1" });
    expect(recs[0].reason).toMatch(/fills a WR need/);
  });
});
