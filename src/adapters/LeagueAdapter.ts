/**
 * LeagueAdapter — the platform-agnostic core of SleepBot.
 *
 * Every MCP tool talks to this interface, never to a platform SDK directly.
 * `SleeperAdapter` implements it today; `EspnAdapter` will implement the same
 * shape in Phase 4. Because the tool signatures depend only on these types,
 * adding a platform or a league is a config change, not a code change.
 *
 * All types here are *normalized*: platform-specific quirks (Sleeper's numeric
 * roster_ids, ESPN's cookie auth, etc.) stay inside each adapter. Downstream
 * code — tools, the future rules engine, the future GUI — sees only this.
 */

/** Which fantasy platform backs a league. */
export type Platform = "sleeper" | "espn";

/** High-level league settings and metadata. */
export interface LeagueInfo {
  leagueId: string;
  name: string;
  season: string;
  platform: Platform;
  status: string;
  totalRosters: number;
  scoringType: string;
  /** Ordered roster slot labels, e.g. ["QB","RB","RB","WR","WR","TE","FLEX","BN","BN"]. */
  rosterPositions: string[];
  /** Raw scoring settings, kept as-is for tools that want the detail. */
  scoringSettings: Record<string, number>;
}

/** One team's roster within a league. */
export interface Roster {
  rosterId: number;
  /** Owner's display name if resolvable, else the platform user id. */
  ownerName: string;
  ownerId: string;
  /** Player ids in the starting lineup, in slot order. */
  starters: string[];
  /** All rostered player ids (starters + bench + IR). */
  players: string[];
  /** Player ids on injured reserve, if the platform exposes them. */
  reserve: string[];
  /** Player ids on the taxi squad, if the platform exposes them. */
  taxi: string[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** A single team's side of a weekly matchup. */
export interface Matchup {
  week: number;
  /** Groups two rosters into the same head-to-head game. */
  matchupId: number;
  rosterId: number;
  ownerName: string;
  points: number;
  starters: string[];
}

/** One row of the computed standings table. */
export interface StandingRow {
  rank: number;
  rosterId: number;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** A league transaction: trade, waiver claim, or free-agent add/drop. */
export interface Transaction {
  transactionId: string;
  type: string;
  status: string;
  week: number;
  /** Player id -> roster id that added the player. */
  adds: Record<string, number>;
  /** Player id -> roster id that dropped the player. */
  drops: Record<string, number>;
  /** Roster ids party to the transaction. */
  rosterIds: number[];
  /** FAAB bid, when the transaction is a waiver claim. */
  faabBid?: number;
  createdMs: number;
}

/** A normalized player record. */
export interface Player {
  playerId: string;
  fullName: string;
  position: string;
  team: string | null;
  status: string | null;
}

/** A player trending across the platform's user base. */
export interface TrendingPlayer {
  player: Player;
  /** Net adds (type "add") or drops (type "drop") over the lookback window. */
  count: number;
}

/** Optional filters for {@link LeagueAdapter.searchPlayers}. */
export interface PlayerSearchFilters {
  position?: string;
  team?: string;
  limit?: number;
}

/**
 * The contract every platform adapter fulfills. Phase 1 is read-only; write
 * methods (proposeTrade, etc.) arrive in Phase 2 and will follow the
 * confirm-by-default pattern (return a draft, never send silently).
 */
export interface LeagueAdapter {
  readonly platform: Platform;

  getLeagueInfo(): Promise<LeagueInfo>;
  getRosters(): Promise<Roster[]>;
  /** Defaults to the current NFL week when `week` is omitted. */
  getMatchups(week?: number): Promise<Matchup[]>;
  getStandings(): Promise<StandingRow[]>;
  /** Defaults to the current NFL week when `week` is omitted. */
  getTransactions(week?: number): Promise<Transaction[]>;
  searchPlayers(query: string, filters?: PlayerSearchFilters): Promise<Player[]>;
  getTrendingPlayers(type: "add" | "drop", limit?: number): Promise<TrendingPlayer[]>;
}
