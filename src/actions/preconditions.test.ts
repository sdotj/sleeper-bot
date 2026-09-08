import { describe, expect, it } from "vitest";
import type { PlayerRef, Roster } from "../adapters/LeagueAdapter.js";
import { checkPreconditions } from "./preconditions.js";

const ref = (id: string, name = id): PlayerRef => ({ playerId: id, name, position: "", team: null });
const base = {
  ownerName: "",
  ownerId: "",
  isYou: false,
  bench: [] as PlayerRef[],
  reserve: [] as PlayerRef[],
  taxi: [] as PlayerRef[],
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
};
const rosters = (): Roster[] => [
  { ...base, rosterId: 1, starters: [ref("a", "Alpha")], bench: [ref("b", "Bravo")] },
  { ...base, rosterId: 2, starters: [ref("c", "Charlie")] },
];

describe("checkPreconditions", () => {
  it("passes a valid trade (each side owns what it sends)", () => {
    const r = checkPreconditions(
      "trade",
      { fromRosterId: 1, toRosterId: 2, sendPlayerIds: ["a"], receivePlayerIds: ["c"] },
      rosters(),
    );
    expect(r.ok).toBe(true);
  });

  it("blocks a trade sending a player you no longer roster", () => {
    const r = checkPreconditions(
      "trade",
      { fromRosterId: 1, toRosterId: 2, sendPlayerIds: ["c"], receivePlayerIds: ["a"] },
      rosters(),
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/Charlie.*roster 2, not 1/);
  });

  it("blocks adding a player who is already rostered (not available)", () => {
    const r = checkPreconditions("add_drop", { rosterId: 1, addPlayerId: "c" }, rosters());
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/already rostered/);
  });

  it("allows adding a genuine free agent and dropping an owned player", () => {
    const r = checkPreconditions("add_drop", { rosterId: 1, addPlayerId: "free", dropPlayerId: "b" }, rosters());
    expect(r.ok).toBe(true);
  });

  it("blocks dropping a player you don't own", () => {
    const r = checkPreconditions("add_drop", { rosterId: 1, addPlayerId: "free", dropPlayerId: "c" }, rosters());
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/can't be dropped/);
  });

  it("blocks a waiver claim for an already-rostered add", () => {
    const r = checkPreconditions("waiver_claim", { rosterId: 1, addPlayerId: "a", faabBid: 5 }, rosters());
    expect(r.ok).toBe(false);
  });
});
