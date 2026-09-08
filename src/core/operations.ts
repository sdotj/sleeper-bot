import type {
  AddDropPayload,
  PlayerSearchFilters,
  TradePayload,
  WaiverClaimPayload,
} from "../adapters/LeagueAdapter.js";
import type { ProposedAction } from "../actions/index.js";
import type { ChatHistory, MemoryStore } from "../history/index.js";
import type { AppContext } from "./context.js";

/**
 * Attach a plain-language `note` to a proposal so any front-end can state
 * clearly whether it was blocked, or is a draft awaiting an explicit execute.
 * Shared by the MCP tools and the HTTP api (dec.gui-architecture).
 */
export function proposalOutcome(action: ProposedAction) {
  const warn = action.verdict.warnings.length
    ? ` Warnings: ${action.verdict.warnings.join("; ")}.`
    : "";
  switch (action.status) {
    case "rejected":
      return {
        ...action,
        note: `BLOCKED by a rule — nothing was stored or sent. ${action.verdict.blockedReasons.join("; ")}`,
      };
    case "executed":
      // Auto mode executes an unblocked proposal immediately; the note must not
      // claim it's still a draft awaiting confirmation (audit #9).
      return {
        ...action,
        note:
          `SENT — this action was executed and is live` +
          `${action.result?.message ? `: ${action.result.message}` : ""}` +
          `${action.result?.platformRef ? ` (ref ${action.result.platformRef})` : ""}.${warn}`,
      };
    case "pending":
      return {
        ...action,
        note:
          `Proposed as a DRAFT — nothing has been sent. It waits in the pending-actions ` +
          `list for you to approve (or execute actionId "${action.id}").${warn}`,
      };
    case "executing":
      return {
        ...action,
        note: `IN PROGRESS — this action was claimed for sending and hasn't resolved yet.${warn}`,
      };
    case "failed":
      return {
        ...action,
        note:
          `FAILED — the send did not complete. It was NOT retried automatically; ` +
          `re-propose it if you still want it.${warn}`,
      };
    default: {
      const exhaustive: never = action.status;
      return { ...action, note: `Unknown action status: ${String(exhaustive)}.` };
    }
  }
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

  // The pipeline refreshes cross-instance config/token itself on every write
  // path (audit #14), so all transports — including MCP/Telegram — are covered,
  // not just this facade.
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

  // --- settings: UI-editable config + secrets (dec.ui-config-editing) -------

  /** The current leagues config (source of truth is the store). */
  getConfig() {
    return this.ctx.config.config;
  }
  /** Validate + persist a new leagues config and adopt it live. Throws on invalid input. */
  saveConfig(parsed: unknown) {
    return this.ctx.saveConfig(parsed);
  }
  /** Discard the stored config and reseed from the environment. */
  resetConfig() {
    return this.ctx.resetConfigToEnv();
  }
  /** Status of the Sleeper write token (never returns the token itself). */
  getSleeperTokenStatus() {
    return this.ctx.sleeperTokenStatus();
  }
  /** Set the Sleeper write token (encrypted at rest); applies live. */
  setSleeperToken(token: string) {
    return this.ctx.setSleeperToken(token);
  }
  /** Remove the stored Sleeper token; revert to the env seed. */
  clearSleeperToken() {
    return this.ctx.clearSleeperToken();
  }

  // --- chat history (dec.chat-history-memory) ------------------------------
  // The persisted conversation store. The chat routes drive it directly (the
  // chat path already calls the chat module directly, not via a facade method).
  get chatHistory(): ChatHistory {
    return this.ctx.chatHistory;
  }

  /** Long-term chat memory (the memory tools + the /api/memory routes use this). */
  get memory(): MemoryStore {
    return this.ctx.memory;
  }
}
