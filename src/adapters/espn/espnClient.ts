/**
 * espnClient — a thin, typed wrapper around ESPN's fantasy-football read API
 * (the `lm-api-reads.fantasy.espn.com` host). ESPN returns one big league object
 * and you request slices of it with `view=` params; private leagues authenticate
 * with the `SWID` and `espn_s2` cookies. Public leagues need no auth.
 *
 * As with the Sleeper client, {@link EspnApi} is the injectable seam so the
 * adapter can be unit-tested against fixtures with no network.
 */

const HOST = "https://lm-api-reads.fantasy.espn.com";

/** A player as ESPN nests it under a roster entry or the player pool. */
export interface EspnPlayer {
  id: number;
  fullName?: string;
  defaultPositionId?: number;
  proTeamId?: number;
  injuryStatus?: string | null;
  ownership?: { percentOwned?: number; percentChange?: number };
}

export interface EspnRosterEntry {
  lineupSlotId?: number;
  playerId?: number;
  playerPoolEntry?: { player?: EspnPlayer };
}

export interface EspnTeam {
  id: number;
  abbrev?: string;
  location?: string;
  nickname?: string;
  name?: string;
  owners?: string[];
  points?: number;
  record?: { overall?: { wins?: number; losses?: number; ties?: number; pointsFor?: number; pointsAgainst?: number } };
  roster?: { entries?: EspnRosterEntry[] };
}

export interface EspnMatchupSide {
  teamId?: number;
  totalPoints?: number;
  rosterForCurrentScoringPeriod?: { entries?: EspnRosterEntry[] };
  rosterForMatchupPeriod?: { entries?: EspnRosterEntry[] };
}

export interface EspnScheduleGame {
  id?: number;
  matchupPeriodId?: number;
  home?: EspnMatchupSide;
  away?: EspnMatchupSide;
}

export interface EspnMember {
  id: string; // SWID, e.g. "{XXXX-...}"
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

export interface EspnTransaction {
  id?: string;
  type?: string;
  status?: string;
  scoringPeriodId?: number;
  bidAmount?: number;
  proposedDate?: number;
  teamId?: number;
  items?: { type?: string; playerId?: number; fromTeamId?: number; toTeamId?: number }[];
}

/** The subset of ESPN's league object SleepBot reads. */
export interface EspnLeague {
  id?: number;
  seasonId?: number;
  scoringPeriodId?: number;
  status?: { currentMatchupPeriod?: number; latestScoringPeriod?: number; firstScoringPeriod?: number };
  settings?: {
    name?: string;
    size?: number;
    rosterSettings?: { lineupSlotCounts?: Record<string, number> };
    scoringSettings?: { scoringItems?: { statId: number; points?: number; pointsOverrides?: Record<string, number> }[] };
    scheduleSettings?: { matchupPeriodCount?: number };
  };
  teams?: EspnTeam[];
  schedule?: EspnScheduleGame[];
  members?: EspnMember[];
  transactions?: EspnTransaction[];
  players?: { player?: EspnPlayer }[];
}

export interface EspnApi {
  /** Fetch the league with the given `view`s (optionally for a specific week). */
  getLeague(views: string[], scoringPeriodId?: number): Promise<EspnLeague>;
  /** The player pool (for search / trending / id resolution), ownership-sorted. */
  getPlayers(): Promise<EspnPlayer[]>;
}

export interface EspnClientOptions {
  /** SWID cookie value (with braces), for private leagues. */
  swid?: string;
  /** espn_s2 cookie value, for private leagues. */
  espnS2?: string;
}

export class EspnClient implements EspnApi {
  private playersCache: { at: number; players: EspnPlayer[] } | null = null;
  /** How long the player pool (ownership/injury) may be reused before a refetch. */
  private static readonly PLAYERS_TTL_MS = 30 * 60_000;
  /** Per-request network deadline so a hung ESPN fetch can't stall a sweep. */
  private static readonly REQUEST_TIMEOUT_MS = 15_000;

  constructor(
    private readonly leagueId: string,
    private readonly season: string,
    private readonly opts: EspnClientOptions = {},
  ) {}

  private base(): string {
    return `${HOST}/apis/v3/games/ffl/seasons/${this.season}/segments/0/leagues/${this.leagueId}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const { swid, espnS2 } = this.opts;
    if (swid && espnS2) extra.Cookie = `SWID=${swid}; espn_s2=${espnS2}`;
    return extra;
  }

  private async get<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetch(url, {
      headers: this.headers(headers),
      signal: AbortSignal.timeout(EspnClient.REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401) {
      throw new Error(
        "ESPN API returned 401 — the league is private and the SWID / espn_s2 cookies are missing or expired. " +
          "Re-capture them from a logged-in ESPN session.",
      );
    }
    if (!res.ok) throw new Error(`ESPN API failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  async getLeague(views: string[], scoringPeriodId?: number): Promise<EspnLeague> {
    const params = new URLSearchParams();
    for (const v of views) params.append("view", v);
    if (scoringPeriodId != null) params.set("scoringPeriodId", String(scoringPeriodId));
    return this.get<EspnLeague>(`${this.base()}?${params}`);
  }

  async getPlayers(): Promise<EspnPlayer[]> {
    // Ownership and injury data drive trending/player views, so it must not be
    // cached forever — reuse within a TTL, then refetch (audit #15).
    if (this.playersCache && Date.now() - this.playersCache.at < EspnClient.PLAYERS_TTL_MS) {
      return this.playersCache.players;
    }
    // ESPN filters the pool via the x-fantasy-filter header; pull a generous,
    // ownership-sorted slice (covers every fantasy-relevant player).
    const filter = JSON.stringify({ players: { limit: 1500, sortPercOwned: { sortPriority: 1, sortAsc: false } } });
    const league = await this.get<EspnLeague>(`${this.base()}?view=kona_player_info`, {
      "x-fantasy-filter": filter,
    });
    const players = (league.players ?? []).map((p) => p.player).filter((p): p is EspnPlayer => !!p);
    this.playersCache = { at: Date.now(), players };
    return players;
  }
}
