import type { Draft, DraftPick, LeagueAdapter, Player } from "../adapters/LeagueAdapter.js";
import type { ValueProvider } from "../value/index.js";
import type { DraftBoard, DraftRecommendation, OnTheClock } from "./types.js";

export interface DraftDeps {
  adapterFor(leagueId: string): LeagueAdapter;
  value: ValueProvider;
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
    const adapter = this.deps.adapterFor(leagueId);
    const [draft, picks, pool] = await Promise.all([
      adapter.getDraft(draftId),
      adapter.getDraftPicks(draftId),
      adapter.getDraftablePlayers(),
    ]);

    const taken = new Set(picks.map((p) => p.playerId));
    const position = opts.position?.toUpperCase();
    const available = pool.filter((p) => !taken.has(p.playerId) && (!position || p.position === position));
    const values = await this.deps.value.getValues(available.map((p) => p.playerId));

    const ranked = available
      .map((p) => ({ p, v: values.get(p.playerId) ?? 0 }))
      .sort((a, b) => b.v - a.v);

    const needs = opts.rosterId != null ? this.rosterNeeds(draft, picks, opts.rosterId) : null;
    return ranked.slice(0, opts.limit ?? 10).map(({ p, v }) => this.toRec(p, v, needs));
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

  private toRec(p: Player, value: number, needs: Record<string, number> | null): DraftRecommendation {
    const parts = [`value ${value}`];
    if (needs && needs[p.position]) parts.push(`fills a ${p.position} need`);
    return { playerId: p.playerId, name: p.fullName, position: p.position, team: p.team, value, reason: parts.join(" · ") };
  }
}
