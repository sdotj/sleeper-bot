import type { Draft, DraftPick } from "../adapters/LeagueAdapter.js";

/** Who is picking next. */
export interface OnTheClock {
  pickNo: number;
  round: number;
  slot: number;
  rosterId: number | null;
}

/** A live snapshot of a draft for display / chat context. */
export interface DraftBoard {
  draft: Draft;
  pickCount: number;
  onTheClock: OnTheClock | null;
  /** Most recent picks, newest first. */
  recentPicks: DraftPick[];
  /** The configured user's next overall pick number, if resolvable. */
  yourNextPickNo: number | null;
}

/** A recommended available player. */
export interface DraftRecommendation {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
  reason: string;
}
