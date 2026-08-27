import type {
  AddDropPayload,
  PlayerSearchFilters,
  TradePayload,
  WaiverClaimPayload,
} from "../adapters/LeagueAdapter.js";
import type { AppContext } from "./context.js";

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
