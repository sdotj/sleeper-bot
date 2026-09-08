import type {
  AddDropPayload,
  Draft,
  DraftPick,
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
  WriteAuthStatus,
  WriteResult,
} from "../LeagueAdapter.js";
import {
  EspnClient,
  type EspnApi,
  type EspnMember,
  type EspnPlayer,
  type EspnRosterEntry,
  type EspnTeam,
} from "./espnClient.js";
import { BENCH_SLOT, IR_SLOT, LINEUP_SLOT_LABEL, injuryLabel, positionLabel, proTeam } from "./espnMaps.js";

/** Thrown by adapter methods ESPN doesn't support yet (drafts, writes). */
export class EspnUnsupportedError extends Error {
  constructor(what: string) {
    super(`${what} is not supported on ESPN yet (Sleeper only).`);
    this.name = "EspnUnsupportedError";
  }
}

/**
 * EspnAdapter — maps ESPN's fantasy read API onto the platform-agnostic
 * {@link LeagueAdapter}. Read-only: league info, rosters, standings, matchups,
 * transactions, and player search/trending. "Which team is mine?" is resolved
 * from the configured SWID (the cookie that also authorizes private leagues),
 * not a username. Drafts and writes throw {@link EspnUnsupportedError}.
 */
export class EspnAdapter implements WriteableLeagueAdapter {
  readonly platform: Platform = "espn";
  // ESPN has no public write API and no draft endpoints we consume.
  readonly capabilities = { write: false, draft: false } as const;

  constructor(
    private readonly leagueId: string,
    private readonly season: string,
    private readonly client: EspnApi = new EspnClient(leagueId, season),
    /** The user's SWID (with braces) — flags their team `isYou`. Optional. */
    private readonly swid?: string,
  ) {}

  async getLeagueInfo(): Promise<LeagueInfo> {
    const l = await this.client.getLeague(["mSettings"]);
    const s = l.settings ?? {};
    const items = s.scoringSettings?.scoringItems ?? [];
    const rec = items.find((i) => i.statId === 53)?.points ?? 0;
    const scoringSettings: Record<string, number> = {};
    for (const it of items) if (it.points != null) scoringSettings[`stat_${it.statId}`] = it.points;

    const counts = s.rosterSettings?.lineupSlotCounts ?? {};
    const rosterPositions: string[] = [];
    for (const [slotId, count] of Object.entries(counts)) {
      const label = LINEUP_SLOT_LABEL[Number(slotId)] ?? `SLOT_${slotId}`;
      for (let i = 0; i < count; i++) rosterPositions.push(label);
    }

    return {
      leagueId: this.leagueId,
      name: s.name ?? "",
      season: this.season,
      platform: this.platform,
      status: l.status?.currentMatchupPeriod ? "in_progress" : "unknown",
      totalRosters: s.size ?? l.teams?.length ?? 0,
      scoringType: rec >= 1 ? "ppr" : rec > 0 ? "half_ppr" : "standard",
      rosterPositions,
      scoringSettings,
    };
  }

  async getRosters(): Promise<Roster[]> {
    const l = await this.client.getLeague(["mTeam", "mRoster"]);
    const members = this.memberMap(l.members ?? []);
    return (l.teams ?? []).map((t) => this.normalizeRoster(t, members));
  }

  async getMyRoster(): Promise<Roster | null> {
    if (!this.swid) return null;
    return (await this.getRosters()).find((r) => r.isYou) ?? null;
  }

  async getStandings(): Promise<StandingRow[]> {
    const rosters = await this.getRosters();
    return [...rosters]
      .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
      .map((r, i) => ({
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

  async getMatchups(week?: number): Promise<Matchup[]> {
    const l = await this.client.getLeague(["mTeam", "mMatchupScore"], week);
    const wk = week ?? l.status?.currentMatchupPeriod ?? 1;
    const members = this.memberMap(l.members ?? []);
    const teamsById = new Map((l.teams ?? []).map((t) => [t.id, t]));
    const out: Matchup[] = [];
    for (const g of l.schedule ?? []) {
      if (g.matchupPeriodId !== wk) continue;
      for (const side of [g.home, g.away]) {
        if (!side?.teamId) continue;
        const team = teamsById.get(side.teamId);
        const entries = side.rosterForCurrentScoringPeriod?.entries ?? side.rosterForMatchupPeriod?.entries ?? [];
        out.push({
          week: wk,
          matchupId: g.id ?? 0,
          rosterId: side.teamId,
          ownerName: team ? this.teamName(team, members) : `Team ${side.teamId}`,
          isYou: team ? this.isYou(team) : false,
          points: side.totalPoints ?? 0,
          starters: this.refs(entries.filter((e) => !this.isBenchOrIr(e))),
        });
      }
    }
    return out;
  }

  async getTransactions(week?: number): Promise<Transaction[]> {
    const l = await this.client.getLeague(["mTransactions2"], week);
    const txns = l.transactions ?? [];
    return txns
      .filter((t) => week == null || t.scoringPeriodId === week)
      .map((t) => {
        const adds: Record<string, number> = {};
        const drops: Record<string, number> = {};
        const rosterIds = new Set<number>();
        for (const it of t.items ?? []) {
          if (it.playerId == null) continue;
          const pid = String(it.playerId);
          if (it.type === "ADD" && it.toTeamId != null) (adds[pid] = it.toTeamId), rosterIds.add(it.toTeamId);
          if (it.type === "DROP" && it.fromTeamId != null) (drops[pid] = it.fromTeamId), rosterIds.add(it.fromTeamId);
          if (it.fromTeamId != null) rosterIds.add(it.fromTeamId);
          if (it.toTeamId != null) rosterIds.add(it.toTeamId);
        }
        return {
          transactionId: t.id ?? "",
          type: (t.type ?? "unknown").toLowerCase(),
          status: (t.status ?? "unknown").toLowerCase(),
          week: t.scoringPeriodId ?? week ?? 0,
          adds,
          drops,
          rosterIds: [...rosterIds],
          faabBid: t.bidAmount,
          createdMs: t.proposedDate ?? 0,
        };
      });
  }

  async searchPlayers(query: string, filters: PlayerSearchFilters = {}): Promise<Player[]> {
    const pool = await this.client.getPlayers();
    const needle = query.trim().toLowerCase();
    const position = filters.position?.toUpperCase();
    const team = filters.team?.toUpperCase();
    const limit = filters.limit ?? 25;
    const out: Player[] = [];
    for (const p of pool) {
      const np = this.normalizePlayer(p);
      if (needle && !np.fullName.toLowerCase().includes(needle)) continue;
      if (position && np.position !== position) continue;
      if (team && (np.team ?? "").toUpperCase() !== team) continue;
      out.push(np);
      if (out.length >= limit) break;
    }
    return out;
  }

  async getTrendingPlayers(type: "add" | "drop", limit = 25): Promise<TrendingPlayer[]> {
    // ESPN has no Sleeper-style trending feed; approximate from each player's
    // change in roster % over the platform (percentChange), which is the same idea.
    const pool = await this.client.getPlayers();
    const scored = pool
      .map((p) => ({ p, change: p.ownership?.percentChange ?? 0 }))
      .filter((x) => (type === "add" ? x.change > 0 : x.change < 0))
      .sort((a, b) => (type === "add" ? b.change - a.change : a.change - b.change))
      .slice(0, limit);
    return scored.map(({ p, change }) => ({ player: this.normalizePlayer(p), count: Math.round(Math.abs(change)) }));
  }

  async resolvePlayers(playerIds: string[]): Promise<PlayerRef[]> {
    const pool = await this.client.getPlayers();
    const byId = new Map(pool.map((p) => [String(p.id), p]));
    return playerIds.map((id) => {
      const p = byId.get(id);
      return {
        playerId: id,
        name: p?.fullName ?? id,
        position: positionLabel(p?.defaultPositionId),
        team: proTeam(p?.proTeamId),
      };
    });
  }

  // --- drafts + writes: not supported on ESPN yet ---------------------------

  async listDrafts(): Promise<Draft[]> {
    throw new EspnUnsupportedError("Drafts");
  }
  async getDraft(): Promise<Draft> {
    throw new EspnUnsupportedError("Drafts");
  }
  async getDraftPicks(): Promise<DraftPick[]> {
    throw new EspnUnsupportedError("Drafts");
  }
  async getDraftablePlayers(): Promise<Player[]> {
    throw new EspnUnsupportedError("Drafts");
  }
  async executeTrade(_payload: TradePayload): Promise<WriteResult> {
    throw new EspnUnsupportedError("Writes");
  }
  async executeWaiverClaim(_payload: WaiverClaimPayload): Promise<WriteResult> {
    throw new EspnUnsupportedError("Writes");
  }
  async executeAddDrop(_payload: AddDropPayload): Promise<WriteResult> {
    throw new EspnUnsupportedError("Writes");
  }
  writeAuthStatus(): WriteAuthStatus {
    // Not a lapsed credential — ESPN simply has no write API (audit: distinguish
    // unsupported from expired auth).
    return { state: "unsupported" };
  }

  // --- internal helpers -----------------------------------------------------

  private normalizeRoster(t: EspnTeam, members: Map<string, EspnMember>): Roster {
    const entries = t.roster?.entries ?? [];
    const overall = t.record?.overall ?? {};
    const starters = entries.filter((e) => !this.isBenchOrIr(e));
    const bench = entries.filter((e) => e.lineupSlotId === BENCH_SLOT);
    const reserve = entries.filter((e) => e.lineupSlotId === IR_SLOT);
    return {
      rosterId: t.id,
      ownerId: t.owners?.[0] ?? "",
      ownerName: this.teamName(t, members),
      isYou: this.isYou(t),
      starters: this.refs(starters),
      bench: this.refs(bench),
      reserve: this.refs(reserve),
      taxi: [],
      wins: overall.wins ?? 0,
      losses: overall.losses ?? 0,
      ties: overall.ties ?? 0,
      pointsFor: overall.pointsFor ?? t.points ?? 0,
      pointsAgainst: overall.pointsAgainst ?? 0,
    };
  }

  private isBenchOrIr(e: EspnRosterEntry): boolean {
    return e.lineupSlotId === BENCH_SLOT || e.lineupSlotId === IR_SLOT;
  }

  private refs(entries: EspnRosterEntry[]): PlayerRef[] {
    return entries.map((e) => {
      const p = e.playerPoolEntry?.player;
      const id = String(p?.id ?? e.playerId ?? "");
      return {
        playerId: id,
        name: p?.fullName ?? id,
        position: positionLabel(p?.defaultPositionId),
        team: proTeam(p?.proTeamId),
      };
    });
  }

  private normalizePlayer(p: EspnPlayer): Player {
    return {
      playerId: String(p.id),
      fullName: p.fullName ?? String(p.id),
      position: positionLabel(p.defaultPositionId),
      team: proTeam(p.proTeamId),
      status: injuryLabel(p.injuryStatus),
    };
  }

  private isYou(t: EspnTeam): boolean {
    if (!this.swid) return false;
    const me = this.swid.toUpperCase();
    return (t.owners ?? []).some((o) => o.toUpperCase() === me);
  }

  /** A recognizable name for a team: its team name, else the owner's display name. */
  private teamName(t: EspnTeam, members: Map<string, EspnMember>): string {
    const name = t.name?.trim() || [t.location, t.nickname].filter(Boolean).join(" ").trim();
    if (name) return name;
    const owner = t.owners?.[0] ? members.get(t.owners[0].toUpperCase()) : undefined;
    return owner?.displayName || t.abbrev || `Team ${t.id}`;
  }

  private memberMap(members: EspnMember[]): Map<string, EspnMember> {
    return new Map(members.map((m) => [m.id.toUpperCase(), m]));
  }
}
