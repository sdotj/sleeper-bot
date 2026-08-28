import type { Draft, DraftPick, LeagueAdapter, Player } from "../adapters/LeagueAdapter.js";
import type { ValueProvider } from "../value/index.js";
import type { DraftBoard, DraftRecommendation, OnTheClock } from "./types.js";

export interface DraftDeps {
  adapterFor(leagueId: string): LeagueAdapter;
  /** Value provider for a league (redraft vs dynasty is per-league config). */
  valueFor(leagueId: string): ValueProvider;
}

/** Bonus added to a player's VORP when their roster still needs that position. */
const NEED_BONUS = 400;

/** An available player scored for draft ranking. */
interface ScoredPlayer {
  p: Player;
  value: number;
  vorp: number;
  score: number;
  needed: boolean;
}

/**
 * DraftAssistant — read-only draft help (dec.draft-assistant). Reads the board
 * from the adapter and ranks available players with the value provider. It never
 * submits a pick; the user drafts in Sleeper and the board updates on the next
 * read. Works for mock or real drafts (by league discovery or explicit draftId).
 */
export class DraftAssistant {
  constructor(private readonly deps: DraftDeps) {}

  listDrafts(leagueId: string): Promise<Draft[]> {
    return this.deps.adapterFor(leagueId).listDrafts();
  }
  getDraft(leagueId: string, draftId: string): Promise<Draft> {
    return this.deps.adapterFor(leagueId).getDraft(draftId);
  }
  getPicks(leagueId: string, draftId: string): Promise<DraftPick[]> {
    return this.deps.adapterFor(leagueId).getDraftPicks(draftId);
  }

  async getBoard(
    leagueId: string,
    draftId: string,
    opts: { yourRosterId?: number } = {},
  ): Promise<DraftBoard> {
    const adapter = this.deps.adapterFor(leagueId);
    const [draft, picks] = await Promise.all([adapter.getDraft(draftId), adapter.getDraftPicks(draftId)]);
    const pickCount = picks.length;
    return {
      draft,
      pickCount,
      onTheClock: draft.status === "complete" ? null : this.onTheClock(draft, pickCount),
      recentPicks: picks.slice(-8).reverse(),
      yourNextPickNo:
        opts.yourRosterId != null ? this.nextPickForRoster(draft, pickCount, opts.yourRosterId) : null,
    };
  }

  async recommend(
    leagueId: string,
    draftId: string,
    opts: { rosterId?: number; position?: string; limit?: number } = {},
  ): Promise<DraftRecommendation[]> {
    const { scored } = await this.scoreAvailable(leagueId, draftId, opts.rosterId);
    const position = opts.position?.toUpperCase();
    return scored
      .filter((s) => !position || s.p.position === position)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 10)
      .map((s) => this.toRec(s.p, s.value, s.vorp, s.needed));
  }

  /** Best available at each position (one pass) — used to keep K/DEF visible in chat context. */
  async bestByPosition(
    leagueId: string,
    draftId: string,
    opts: { rosterId?: number; perPosition?: number } = {},
  ): Promise<Record<string, DraftRecommendation[]>> {
    const { scored } = await this.scoreAvailable(leagueId, draftId, opts.rosterId);
    const perPosition = opts.perPosition ?? 3;
    const out: Record<string, ScoredPlayer[]> = {};
    for (const s of scored) (out[s.p.position] ??= []).push(s);
    const result: Record<string, DraftRecommendation[]> = {};
    for (const [pos, list] of Object.entries(out)) {
      result[pos] = list
        .sort((a, b) => b.score - a.score)
        .slice(0, perPosition)
        .map((s) => this.toRec(s.p, s.value, s.vorp, s.needed));
    }
    return result;
  }

  /** Score every available player by value-over-replacement + roster-need boost. */
  private async scoreAvailable(
    leagueId: string,
    draftId: string,
    rosterId?: number,
  ): Promise<{ draft: Draft; scored: ScoredPlayer[] }> {
    const adapter = this.deps.adapterFor(leagueId);
    const [draft, picks, pool] = await Promise.all([
      adapter.getDraft(draftId),
      adapter.getDraftPicks(draftId),
      adapter.getDraftablePlayers(),
    ]);

    const taken = new Set(picks.map((p) => p.playerId));
    const available = pool.filter((p) => !taken.has(p.playerId));
    const values = await this.deps.valueFor(leagueId).getValues(available.map((p) => p.playerId));

    const replacement = this.replacementByPosition(draft, available, values);
    const needs = rosterId != null ? this.rosterNeeds(draft, picks, rosterId) : null;

    const scored = available.map((p) => {
      const value = values.get(p.playerId) ?? 0;
      const vorp = value - (replacement[p.position] ?? 0);
      const needBoost = needs && needs[p.position] ? NEED_BONUS * needs[p.position] : 0;
      return { p, value, vorp, score: vorp + needBoost, needed: !!(needs && needs[p.position]) };
    });
    return { draft, scored };
  }

  // --- internals -----------------------------------------------------------

  private onTheClock(draft: Draft, pickCount: number): OnTheClock | null {
    if (!draft.teams) return null;
    const pickNo = pickCount + 1;
    if (draft.rounds && pickNo > draft.rounds * draft.teams) return null; // draft over
    const { round, slot } = this.slotForPick(draft, pickNo);
    return { pickNo, round, slot, rosterId: draft.slotToRosterId[String(slot)] ?? null };
  }

  /** Overall pick number -> {round, draft slot}, honoring snake reversal. */
  private slotForPick(draft: Draft, pickNo: number): { round: number; slot: number } {
    const teams = draft.teams;
    const round = Math.floor((pickNo - 1) / teams) + 1;
    const idxInRound = (pickNo - 1) % teams; // 0-based
    const reversed = draft.type === "snake" && round % 2 === 0;
    return { round, slot: reversed ? teams - idxInRound : idxInRound + 1 };
  }

  private nextPickForRoster(draft: Draft, pickCount: number, rosterId: number): number | null {
    if (!draft.teams || !draft.rounds) return null;
    const slotEntry = Object.entries(draft.slotToRosterId).find(([, rid]) => rid === rosterId);
    if (!slotEntry) return null;
    const mySlot = Number(slotEntry[0]);
    for (let pickNo = pickCount + 1; pickNo <= draft.rounds * draft.teams; pickNo++) {
      if (this.slotForPick(draft, pickNo).slot === mySlot) return pickNo;
    }
    return null;
  }

  /** Positions where the roster is short of its starter slots. */
  private rosterNeeds(draft: Draft, picks: DraftPick[], rosterId: number): Record<string, number> {
    const drafted: Record<string, number> = {};
    for (const p of picks) {
      if (p.rosterId === rosterId && p.position) drafted[p.position] = (drafted[p.position] ?? 0) + 1;
    }
    const needs: Record<string, number> = {};
    for (const [pos, slots] of Object.entries(draft.starterSlots)) {
      if (pos === "FLEX" || pos === "SUPER_FLEX") continue; // flex is fillable by many positions
      const need = slots - (drafted[pos] ?? 0);
      if (need > 0) needs[pos] = need;
    }
    return needs;
  }

  /**
   * Replacement value per position = the value of the last "startable" player at
   * that position across the league (teams × starters/team, flex shared among
   * RB/WR/TE, superflex added to QB). Value above that is what makes a pick
   * valuable — the basis for value-over-replacement.
   */
  private replacementByPosition(
    draft: Draft,
    available: Player[],
    values: Map<string, number>,
  ): Record<string, number> {
    const slots = draft.starterSlots;
    const flexShare = (slots.FLEX ?? 0) / 3; // RB/WR/TE split the flex
    const startersPerTeam: Record<string, number> = {
      QB: (slots.QB ?? 0) + (slots.SUPER_FLEX ?? 0),
      RB: (slots.RB ?? 0) + flexShare,
      WR: (slots.WR ?? 0) + flexShare,
      TE: (slots.TE ?? 0) + flexShare,
      K: slots.K ?? 0,
      DEF: slots.DEF ?? 0,
    };

    const byPos = new Map<string, number[]>();
    for (const p of available) {
      const arr = byPos.get(p.position) ?? [];
      arr.push(values.get(p.playerId) ?? 0);
      byPos.set(p.position, arr);
    }

    const replacement: Record<string, number> = {};
    for (const [pos, vals] of byPos) {
      vals.sort((a, b) => b - a);
      const idx = Math.max(1, Math.round((draft.teams || 12) * (startersPerTeam[pos] ?? 0)));
      replacement[pos] = vals[idx] ?? vals[vals.length - 1] ?? 0;
    }
    return replacement;
  }

  private toRec(p: Player, value: number, vorp: number, needed: boolean): DraftRecommendation {
    const parts = [`value ${value}`, `VORP ${Math.round(vorp)}`];
    if (needed) parts.push(`fills a ${p.position} need`);
    return { playerId: p.playerId, name: p.fullName, position: p.position, team: p.team, value, reason: parts.join(" · ") };
  }
}
