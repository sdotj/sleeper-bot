/**
 * sleeperClient — a thin, typed wrapper around Sleeper's public read API
 * (https://docs.sleeper.com). No authentication is required for any of these
 * endpoints. The client owns two concerns beyond raw fetch:
 *
 *   1. A single in-memory cache of the NFL players dump. That endpoint returns
 *      ~5MB and Sleeper explicitly asks callers to fetch it at most once per
 *      day, so we memoize it for the process lifetime.
 *   2. Resolving the "current" NFL week from the /state endpoint, so tools can
 *      default `week` sensibly.
 */

const BASE = "https://api.sleeper.app/v1";

/** Shape of one entry in Sleeper's /players/nfl dump (fields we use). */
export interface SleeperPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  team?: string | null;
  status?: string | null;
  /** Sleeper's overall season-long rank (lower = better; ~9999999 = unranked). */
  search_rank?: number | null;
  /** Years of NFL experience; 0 = rookie. */
  years_exp?: number | null;
}

export interface SleeperNflState {
  week: number;
  season: string;
  season_type: string;
  leg: number;
}

/**
 * The slice of Sleeper's API that {@link SleeperAdapter} depends on. Depending
 * on this interface rather than the concrete client lets tests inject a fake
 * with canned responses — no network, no ~5MB players download.
 */
export interface SleeperApi {
  getLeague(leagueId: string): Promise<Record<string, unknown>>;
  getRosters(leagueId: string): Promise<Record<string, unknown>[]>;
  getUsers(leagueId: string): Promise<Record<string, unknown>[]>;
  getMatchups(leagueId: string, week: number): Promise<Record<string, unknown>[]>;
  getTransactions(leagueId: string, week: number): Promise<Record<string, unknown>[]>;
  getTrending(type: "add" | "drop", limit: number): Promise<{ player_id: string; count: number }[]>;
  getNflState(): Promise<SleeperNflState>;
  getUserByName(username: string): Promise<Record<string, unknown> | null>;
  getPlayers(): Promise<Record<string, SleeperPlayer>>;
  getDraftsForLeague(leagueId: string): Promise<Record<string, unknown>[]>;
  getDraft(draftId: string): Promise<Record<string, unknown>>;
  getDraftPicks(draftId: string): Promise<Record<string, unknown>[]>;
}

export class SleeperClient implements SleeperApi {
  private playersCache: Record<string, SleeperPlayer> | null = null;
  private playersCacheAt = 0;
  /** Sleeper asks for at most one players fetch per day. */
  private static readonly PLAYERS_TTL_MS = 24 * 60 * 60 * 1000;

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) {
      throw new Error(`Sleeper API ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  getLeague(leagueId: string) {
    return this.get<Record<string, unknown>>(`/league/${leagueId}`);
  }

  getRosters(leagueId: string) {
    return this.get<Record<string, unknown>[]>(`/league/${leagueId}/rosters`);
  }

  /** League members, used to map owner_id -> display name. */
  getUsers(leagueId: string) {
    return this.get<Record<string, unknown>[]>(`/league/${leagueId}/users`);
  }

  getMatchups(leagueId: string, week: number) {
    return this.get<Record<string, unknown>[]>(`/league/${leagueId}/matchups/${week}`);
  }

  getTransactions(leagueId: string, week: number) {
    return this.get<Record<string, unknown>[]>(`/league/${leagueId}/transactions/${week}`);
  }

  getTrending(type: "add" | "drop", limit: number) {
    return this.get<{ player_id: string; count: number }[]>(
      `/players/nfl/trending/${type}?limit=${limit}`,
    );
  }

  getNflState() {
    return this.get<SleeperNflState>(`/state/nfl`);
  }

  /** Public user record; used to resolve a username to a user_id in later phases. */
  getUserByName(username: string) {
    return this.get<Record<string, unknown> | null>(`/user/${username}`);
  }

  /**
   * The full NFL players map, memoized for the process (24h TTL). Keyed by
   * player_id. This is the source of truth for turning the player_id strings
   * that appear on rosters/matchups into human-readable names.
   */
  async getPlayers(): Promise<Record<string, SleeperPlayer>> {
    const fresh = this.playersCache && Date.now() - this.playersCacheAt < SleeperClient.PLAYERS_TTL_MS;
    if (fresh) return this.playersCache!;
    this.playersCache = await this.get<Record<string, SleeperPlayer>>(`/players/nfl`);
    this.playersCacheAt = Date.now();
    return this.playersCache;
  }

  // --- drafts (public reads; mock and real drafts share these endpoints) -----

  getDraftsForLeague(leagueId: string) {
    return this.get<Record<string, unknown>[]>(`/league/${leagueId}/drafts`);
  }

  getDraft(draftId: string) {
    return this.get<Record<string, unknown>>(`/draft/${draftId}`);
  }

  getDraftPicks(draftId: string) {
    return this.get<Record<string, unknown>[]>(`/draft/${draftId}/picks`);
  }
}
