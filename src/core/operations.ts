import type {
  AddDropPayload,
  PlayerSearchFilters,
  TradePayload,
  WaiverClaimPayload,
} from "../adapters/LeagueAdapter.js";
import type { ProposedAction } from "../actions/index.js";
import type { AppContext } from "./context.js";

/**
 * Attach a plain-language `note` to a proposal so any front-end can state
 * clearly whether it was blocked, or is a draft awaiting an explicit execute.
 * Shared by the MCP tools and the HTTP api (dec.gui-architecture).
 */
export function proposalOutcome(action: ProposedAction) {
  if (action.status === "rejected") {
    return {
      ...action,
      note: `BLOCKED by a rule — nothing was stored or sent. ${action.verdict.blockedReasons.join("; ")}`,
    };
  }
  const warn = action.verdict.warnings.length
    ? ` Warnings: ${action.verdict.warnings.join("; ")}.`
    : "";
  return {
    ...action,
    note:
      `Proposed as a DRAFT — nothing has been sent. To send it, call execute ` +
      `with actionId "${action.id}".${warn}`,
  };
}

/**
 * SleepBotOperations — the single catalog of things SleepBot can do, over an
 * {@link AppContext}. Every front-end binds to this: the MCP tools, the HTTP
 * api, and the chat loop all call these methods, so "the same tools everywhere"
 * is literally true (dec.gui-architecture). Methods return plain domain data;
 * each front-end handles its own transport/serialization.
 */
export class SleepBotOperations {
  constructor(private readonly ctx: AppContext) {}

  // --- reads ---------------------------------------------------------------

  listLeagues() {
    return this.ctx.config.list().map((l) => ({
      id: l.id,
      platform: l.platform,
      sleeperLeagueId: l.sleeper?.leagueId,
      espnLeagueId: l.espn?.leagueId,
    }));
  }

  getLeagueInfo(leagueId: string) {
    return this.ctx.adapterFor(leagueId).getLeagueInfo();
  }
  getRosters(leagueId: string) {
    return this.ctx.adapterFor(leagueId).getRosters();
  }
  getMyRoster(leagueId: string) {
    return this.ctx.adapterFor(leagueId).getMyRoster();
  }
  getStandings(leagueId: string) {
    return this.ctx.adapterFor(leagueId).getStandings();
  }
  getMatchups(leagueId: string, week?: number) {
    return this.ctx.adapterFor(leagueId).getMatchups(week);
  }
  getTransactions(leagueId: string, week?: number) {
    return this.ctx.adapterFor(leagueId).getTransactions(week);
  }
  searchPlayers(leagueId: string, query: string, filters?: PlayerSearchFilters) {
    return this.ctx.adapterFor(leagueId).searchPlayers(query, filters);
  }
  getTrendingPlayers(leagueId: string, type: "add" | "drop", limit?: number) {
    return this.ctx.adapterFor(leagueId).getTrendingPlayers(type, limit);
  }
  getAuthStatus(leagueId: string) {
    return this.ctx.adapterFor(leagueId).writeAuthStatus();
  }
  getAuditLog(leagueId?: string) {
    return this.ctx.audit.list(leagueId);
  }

  // --- drafts (read-only assistant) ----------------------------------------

  listDrafts(leagueId: string) {
    return this.ctx.draft.listDrafts(leagueId);
  }
  getDraftPicks(leagueId: string, draftId: string) {
    return this.ctx.draft.getPicks(leagueId, draftId);
  }
  getDraftBoard(leagueId: string, draftId: string, yourRosterId?: number) {
    return this.ctx.draft.getBoard(leagueId, draftId, { yourRosterId });
  }
  getDraftRecommendations(
    leagueId: string,
    draftId: string,
    opts: { rosterId?: number; position?: string; limit?: number } = {},
  ) {
    return this.ctx.draft.recommend(leagueId, draftId, opts);
  }
  /** Best available at every position (keeps K/DEF visible). */
  getDraftBestByPosition(
    leagueId: string,
    draftId: string,
    opts: { rosterId?: number; perPosition?: number } = {},
  ) {
    return this.ctx.draft.bestByPosition(leagueId, draftId, opts);
  }

  // --- writes (confirm-by-default via the pipeline) ------------------------

  proposeTrade(leagueId: string, payload: TradePayload) {
    return this.ctx.pipeline.propose(leagueId, "trade", payload);
  }
  proposeWaiverClaim(leagueId: string, payload: WaiverClaimPayload) {
    return this.ctx.pipeline.propose(leagueId, "waiver_claim", payload);
  }
  proposeAddDrop(leagueId: string, payload: AddDropPayload) {
    return this.ctx.pipeline.propose(leagueId, "add_drop", payload);
  }
  executeAction(actionId: string) {
    return this.ctx.pipeline.execute(actionId, "user");
  }
  listPendingActions(leagueId?: string) {
    return this.ctx.pipeline.listPending(leagueId);
  }
}
