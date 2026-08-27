import type {
  LeagueAdapter,
  LeagueInfo,
  Matchup,
  Platform,
  Player,
  PlayerSearchFilters,
  Roster,
  StandingRow,
  Transaction,
  TrendingPlayer,
} from "../LeagueAdapter.js";
import { SleeperClient, type SleeperPlayer } from "./sleeperClient.js";

/**
 * SleeperAdapter — maps Sleeper's public API onto the platform-agnostic
 * {@link LeagueAdapter} contract. All Sleeper-specific shapes and quirks are
 * normalized here; nothing above this layer knows it is talking to Sleeper.
 *
 * Read-only (Phase 1). Write methods are intentionally absent until Phase 2,
 * where they will go through Sleeper's unofficial private API and the rules
 * engine.
 */
export class SleeperAdapter implements LeagueAdapter {
  readonly platform: Platform = "sleeper";

  constructor(
    private readonly leagueId: string,
    private readonly client: SleeperClient = new SleeperClient(),
  ) {}

  async getLeagueInfo(): Promise<LeagueInfo> {
    const l = await this.client.getLeague(this.leagueId);
    const settings = (l.scoring_settings as Record<string, number>) ?? {};
    return {
      leagueId: this.leagueId,
      name: (l.name as string) ?? "",
      season: (l.season as string) ?? "",
      platform: this.platform,
      status: (l.status as string) ?? "unknown",
      totalRosters: (l.total_rosters as number) ?? 0,
      scoringType: this.inferScoringType(settings),
      rosterPositions: (l.roster_positions as string[]) ?? [],
      scoringSettings: settings,
    };
  }

  async getRosters(): Promise<Roster[]> {
    const [rosters, ownerNames] = await Promise.all([
      this.client.getRosters(this.leagueId),
      this.ownerNameMap(),
    ]);
    return rosters.map((r) => this.normalizeRoster(r, ownerNames));
  }

  async getMatchups(week?: number): Promise<Matchup[]> {
    const wk = week ?? (await this.currentWeek());
    const [matchups, ownerByRoster] = await Promise.all([
      this.client.getMatchups(this.leagueId, wk),
      this.ownerByRosterMap(),
    ]);
    return matchups.map((m) => ({
      week: wk,
      matchupId: (m.matchup_id as number) ?? 0,
      rosterId: (m.roster_id as number) ?? 0,
      ownerName: ownerByRoster.get((m.roster_id as number) ?? -1) ?? "unknown",
      points: (m.points as number) ?? 0,
      starters: (m.starters as string[]) ?? [],
    }));
  }

  async getStandings(): Promise<StandingRow[]> {
    const rosters = await this.getRosters();
    const sorted = [...rosters].sort(
      (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor,
    );
    return sorted.map((r, i) => ({
      rank: i + 1,
      rosterId: r.rosterId,
      ownerName: r.ownerName,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pointsFor: r.pointsFor,
      pointsAgainst: r.pointsAgainst,
    }));
  }

  async getTransactions(week?: number): Promise<Transaction[]> {
    const wk = week ?? (await this.currentWeek());
    const txns = await this.client.getTransactions(this.leagueId, wk);
    return txns.map((t) => ({
      transactionId: (t.transaction_id as string) ?? "",
      type: (t.type as string) ?? "unknown",
      status: (t.status as string) ?? "unknown",
      week: wk,
      adds: (t.adds as Record<string, number>) ?? {},
      drops: (t.drops as Record<string, number>) ?? {},
      rosterIds: (t.roster_ids as number[]) ?? [],
      faabBid: (t.settings as { waiver_bid?: number } | null)?.waiver_bid,
      createdMs: (t.created as number) ?? 0,
    }));
  }

  async searchPlayers(query: string, filters: PlayerSearchFilters = {}): Promise<Player[]> {
    const players = await this.client.getPlayers();
    const needle = query.trim().toLowerCase();
    const position = filters.position?.toUpperCase();
    const team = filters.team?.toUpperCase();
    const limit = filters.limit ?? 25;

    const matches: Player[] = [];
    for (const raw of Object.values(players)) {
      const p = this.normalizePlayer(raw);
      if (needle && !this.fullName(raw).toLowerCase().includes(needle)) continue;
      if (position && p.position !== position) continue;
      if (team && (p.team ?? "").toUpperCase() !== team) continue;
      matches.push(p);
      if (matches.length >= limit) break;
    }
    return matches;
  }

  async getTrendingPlayers(type: "add" | "drop", limit = 25): Promise<TrendingPlayer[]> {
    const [trending, players] = await Promise.all([
      this.client.getTrending(type, limit),
      this.client.getPlayers(),
    ]);
    return trending.map((t) => ({
      player: this.normalizePlayer(players[t.player_id] ?? { player_id: t.player_id }),
      count: t.count,
    }));
  }

  // --- internal helpers -----------------------------------------------------

  private normalizeRoster(r: Record<string, unknown>, ownerNames: Map<string, string>): Roster {
    const settings = (r.settings as Record<string, number>) ?? {};
    const ownerId = (r.owner_id as string) ?? "";
    return {
      rosterId: (r.roster_id as number) ?? 0,
      ownerId,
      ownerName: ownerNames.get(ownerId) ?? ownerId ?? "unknown",
      starters: (r.starters as string[]) ?? [],
      players: (r.players as string[]) ?? [],
      reserve: (r.reserve as string[] | null) ?? [],
      taxi: (r.taxi as string[] | null) ?? [],
      wins: settings.wins ?? 0,
      losses: settings.losses ?? 0,
      ties: settings.ties ?? 0,
      // Sleeper stores points as whole + hundredths (fpts + fpts_decimal).
      pointsFor: this.points(settings.fpts, settings.fpts_decimal),
      pointsAgainst: this.points(settings.fpts_against, settings.fpts_against_decimal),
    };
  }

  private points(whole?: number, decimal?: number): number {
    return (whole ?? 0) + (decimal ?? 0) / 100;
  }

  private normalizePlayer(raw: SleeperPlayer): Player {
    return {
      playerId: raw.player_id,
      fullName: this.fullName(raw),
      position: raw.position ?? "",
      team: raw.team ?? null,
      status: raw.status ?? null,
    };
  }

  private fullName(raw: SleeperPlayer): string {
    if (raw.full_name) return raw.full_name;
    const joined = [raw.first_name, raw.last_name].filter(Boolean).join(" ");
    return joined || raw.player_id;
  }

  private inferScoringType(settings: Record<string, number>): string {
    const ppr = settings.rec ?? 0;
    if (ppr >= 1) return "ppr";
    if (ppr > 0) return "half_ppr";
    return "standard";
  }

  /** owner_id (user_id) -> display name. */
  private async ownerNameMap(): Promise<Map<string, string>> {
    const users = await this.client.getUsers(this.leagueId);
    const map = new Map<string, string>();
    for (const u of users) {
      const id = (u.user_id as string) ?? "";
      const meta = (u.metadata as { team_name?: string } | null) ?? null;
      map.set(id, meta?.team_name || (u.display_name as string) || id);
    }
    return map;
  }

  /** roster_id -> owner display name, joining rosters to users. */
  private async ownerByRosterMap(): Promise<Map<number, string>> {
    const [rosters, ownerNames] = await Promise.all([
      this.client.getRosters(this.leagueId),
      this.ownerNameMap(),
    ]);
    const map = new Map<number, string>();
    for (const r of rosters) {
      const rosterId = (r.roster_id as number) ?? 0;
      const ownerId = (r.owner_id as string) ?? "";
      map.set(rosterId, ownerNames.get(ownerId) ?? ownerId ?? "unknown");
    }
    return map;
  }

  private async currentWeek(): Promise<number> {
    const state = await this.client.getNflState();
    return state.week && state.week > 0 ? state.week : 1;
  }
}
