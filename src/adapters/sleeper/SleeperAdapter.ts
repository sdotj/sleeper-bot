import type {
  AddDropPayload,
  LeagueInfo,
  Matchup,
  Platform,
  Player,
  PlayerRef,
  PlayerSearchFilters,
  Roster,
  StandingRow,
  TradePayload,
  Transaction,
  TrendingPlayer,
  WaiverClaimPayload,
  WriteableLeagueAdapter,
  WriteResult,
} from "../LeagueAdapter.js";
import type { SessionProvider } from "../../auth/SessionProvider.js";
import { SleeperClient, type SleeperApi, type SleeperPlayer } from "./sleeperClient.js";
import { SleeperWriteClient } from "./sleeperWriteClient.js";

/**
 * SleeperAdapter — maps Sleeper's public API onto the platform-agnostic
 * {@link LeagueAdapter} contract. All Sleeper-specific shapes and quirks are
 * normalized here; nothing above this layer knows it is talking to Sleeper.
 *
 * "Which team is mine?" is resolved from the configured `username`: it is
 * looked up once to a user_id, and every roster/standing/matchup for that owner
 * is flagged `isYou`. Player ids are joined to names inline so callers never
 * have to chain a second lookup.
 *
 * Read-only (Phase 1). Write methods are intentionally absent until Phase 2.
 */
export class SleeperAdapter implements WriteableLeagueAdapter {
  readonly platform: Platform = "sleeper";

  /** Memoized resolution of `username` -> user_id (null when unset/unknown). */
  private selfUserIdPromise?: Promise<string | null>;
  private readonly writeClient?: SleeperWriteClient;

  constructor(
    private readonly leagueId: string,
    private readonly client: SleeperApi = new SleeperClient(),
    private readonly username?: string,
    /** Session for the unofficial write API; omit for a read-only adapter. */
    session?: SessionProvider,
  ) {
    if (session) this.writeClient = new SleeperWriteClient(leagueId, session);
  }

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
    const [rosters, ownerNames, players, selfId] = await Promise.all([
      this.client.getRosters(this.leagueId),
      this.ownerNameMap(),
      this.client.getPlayers(),
      this.selfUserId(),
    ]);
    return rosters.map((r) => this.normalizeRoster(r, ownerNames, players, selfId));
  }

  async getMyRoster(): Promise<Roster | null> {
    if (!this.username) return null;
    const rosters = await this.getRosters();
    return rosters.find((r) => r.isYou) ?? null;
  }

  async getMatchups(week?: number): Promise<Matchup[]> {
    const wk = week ?? (await this.currentWeek());
    const [matchups, ownerByRoster, players, myRosterId] = await Promise.all([
      this.client.getMatchups(this.leagueId, wk),
      this.ownerByRosterMap(),
      this.client.getPlayers(),
      this.myRosterId(),
    ]);
    return matchups.map((m) => {
      const rosterId = (m.roster_id as number) ?? 0;
      return {
        week: wk,
        matchupId: (m.matchup_id as number) ?? 0,
        rosterId,
        ownerName: ownerByRoster.get(rosterId) ?? "unknown",
        isYou: myRosterId !== null && rosterId === myRosterId,
        points: (m.points as number) ?? 0,
        starters: this.buildRefs((m.starters as string[]) ?? [], players),
      };
    });
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
      isYou: r.isYou,
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

  async resolvePlayers(playerIds: string[]): Promise<PlayerRef[]> {
    const players = await this.client.getPlayers();
    return this.buildRefs(playerIds, players);
  }

  // --- writes (unofficial Sleeper private API; see SleeperWriteClient) -------

  executeTrade(payload: TradePayload): Promise<WriteResult> {
    return this.write().executeTrade(payload);
  }

  executeWaiverClaim(payload: WaiverClaimPayload): Promise<WriteResult> {
    return this.write().executeWaiverClaim(payload);
  }

  executeAddDrop(payload: AddDropPayload): Promise<WriteResult> {
    return this.write().executeAddDrop(payload);
  }

  /** The write client, or a clear error if this adapter was built read-only. */
  private write(): SleeperWriteClient {
    if (!this.writeClient) {
      throw new Error(
        `Sleeper adapter for league ${this.leagueId} was created without a session, ` +
          `so it is read-only. Configure a session token to enable writes.`,
      );
    }
    return this.writeClient;
  }

  // --- internal helpers -----------------------------------------------------

  private normalizeRoster(
    r: Record<string, unknown>,
    ownerNames: Map<string, string>,
    players: Record<string, SleeperPlayer>,
    selfUserId: string | null,
  ): Roster {
    const settings = (r.settings as Record<string, number>) ?? {};
    const ownerId = (r.owner_id as string) ?? "";
    const all = (r.players as string[]) ?? [];
    const starters = (r.starters as string[]) ?? [];
    const reserve = (r.reserve as string[] | null) ?? [];
    const taxi = (r.taxi as string[] | null) ?? [];
    // Bench = rostered players that are neither starting nor on IR/taxi.
    const nonBench = new Set([...starters, ...reserve, ...taxi]);
    const bench = all.filter((id) => !nonBench.has(id));

    return {
      rosterId: (r.roster_id as number) ?? 0,
      ownerId,
      ownerName: ownerNames.get(ownerId) ?? ownerId ?? "unknown",
      isYou: selfUserId !== null && ownerId === selfUserId,
      starters: this.buildRefs(starters, players),
      bench: this.buildRefs(bench, players),
      reserve: this.buildRefs(reserve, players),
      taxi: this.buildRefs(taxi, players),
      wins: settings.wins ?? 0,
      losses: settings.losses ?? 0,
      ties: settings.ties ?? 0,
      // Sleeper stores points as whole + hundredths (fpts + fpts_decimal).
      pointsFor: this.points(settings.fpts, settings.fpts_decimal),
      pointsAgainst: this.points(settings.fpts_against, settings.fpts_against_decimal),
    };
  }

  /** Join a list of player ids to name/position/team, preserving order. */
  private buildRefs(ids: string[], players: Record<string, SleeperPlayer>): PlayerRef[] {
    return ids.map((id) => {
      const raw = players[id] ?? { player_id: id };
      return {
        playerId: id,
        name: this.fullName(raw),
        position: raw.position ?? "",
        team: raw.team ?? null,
      };
    });
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

  /** Resolve the configured username to a Sleeper user_id, memoized. */
  private async selfUserId(): Promise<string | null> {
    if (!this.username) return null;
    if (!this.selfUserIdPromise) {
      this.selfUserIdPromise = this.client
        .getUserByName(this.username)
        .then((u) => (u?.user_id as string) ?? null)
        .catch(() => null);
    }
    return this.selfUserIdPromise;
  }

  /** The configured user's roster_id in this league, or null. */
  private async myRosterId(): Promise<number | null> {
    const selfId = await this.selfUserId();
    if (!selfId) return null;
    const rosters = await this.client.getRosters(this.leagueId);
    const mine = rosters.find((r) => (r.owner_id as string) === selfId);
    return mine ? ((mine.roster_id as number) ?? null) : null;
  }

  private async currentWeek(): Promise<number> {
    const state = await this.client.getNflState();
    return state.week && state.week > 0 ? state.week : 1;
  }
}
