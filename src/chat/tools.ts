import type Anthropic from "@anthropic-ai/sdk";
import { proposalOutcome, type SleepBotOperations } from "../core/index.js";

const leagueId = { leagueId: { type: "string", description: "The league label from list_leagues." } };

/**
 * The SleepBot operations exposed to Claude in the chat panel — the same
 * catalog every other front-end uses (dec.chat-panel). Writes stay
 * confirm-by-default: propose_* only drafts; execute_action sends.
 */
export const CHAT_TOOLS: Anthropic.Tool[] = [
  { name: "list_leagues", description: "List configured leagues (no API call).", input_schema: { type: "object", properties: {} } },
  { name: "get_league_info", description: "League settings, scoring, season, roster slots.", input_schema: { type: "object", properties: { ...leagueId }, required: ["leagueId"] } },
  { name: "get_rosters", description: "All rosters with resolved player names, starters/bench/IR, and records.", input_schema: { type: "object", properties: { ...leagueId }, required: ["leagueId"] } },
  { name: "get_my_roster", description: "The configured user's own roster (null if no username set).", input_schema: { type: "object", properties: { ...leagueId }, required: ["leagueId"] } },
  { name: "get_standings", description: "Standings ranked by wins then points-for.", input_schema: { type: "object", properties: { ...leagueId }, required: ["leagueId"] } },
  { name: "get_matchups", description: "A week's matchups and scores (defaults to current week).", input_schema: { type: "object", properties: { ...leagueId, week: { type: "number" } }, required: ["leagueId"] } },
  { name: "get_transactions", description: "A week's trades, waivers, and add/drops (defaults to current week).", input_schema: { type: "object", properties: { ...leagueId, week: { type: "number" } }, required: ["leagueId"] } },
  { name: "search_players", description: "Find players by name; resolve names <-> ids. Filter by position/team.", input_schema: { type: "object", properties: { ...leagueId, query: { type: "string" }, position: { type: "string" }, team: { type: "string" }, limit: { type: "number" } }, required: ["leagueId", "query"] } },
  { name: "get_trending_players", description: "Most-added or most-dropped players across Sleeper.", input_schema: { type: "object", properties: { ...leagueId, type: { type: "string", enum: ["add", "drop"] }, limit: { type: "number" } }, required: ["leagueId"] } },
  { name: "get_drafts", description: "List drafts for a league (id, status, type, rounds, teams). Use a draftId with the draft tools; a mock draft's id also works.", input_schema: { type: "object", properties: { ...leagueId }, required: ["leagueId"] } },
  { name: "get_draft_board", description: "Live draft board: status, who's on the clock (pick/round/slot/roster), recent picks. Pass yourRosterId for your next pick number.", input_schema: { type: "object", properties: { ...leagueId, draftId: { type: "string" }, yourRosterId: { type: "number" } }, required: ["leagueId", "draftId"] } },
  { name: "get_draft_recommendations", description: "Best available players in a draft by value (KTC), drafted players excluded. rosterId weights toward your needs; position filters (QB/RB/WR/TE/K/DEF).", input_schema: { type: "object", properties: { ...leagueId, draftId: { type: "string" }, rosterId: { type: "number" }, position: { type: "string" }, limit: { type: "number" } }, required: ["leagueId", "draftId"] } },
  { name: "get_auth_status", description: "Whether writes are authorized (ok/needs-reauth) and token expiry.", input_schema: { type: "object", properties: { ...leagueId }, required: ["leagueId"] } },
  { name: "get_audit_log", description: "History of proposed/executed/rejected actions.", input_schema: { type: "object", properties: { leagueId: { type: "string" } } } },
  { name: "list_pending_actions", description: "Proposed actions awaiting confirmation.", input_schema: { type: "object", properties: { leagueId: { type: "string" } } } },
  {
    name: "propose_trade",
    description: "DRAFT a trade (runs rules). Does NOT send it. Returns an actionId to confirm later.",
    input_schema: { type: "object", properties: { ...leagueId, fromRosterId: { type: "number" }, toRosterId: { type: "number" }, sendPlayerIds: { type: "array", items: { type: "string" } }, receivePlayerIds: { type: "array", items: { type: "string" } } }, required: ["leagueId", "fromRosterId", "toRosterId", "sendPlayerIds", "receivePlayerIds"] },
  },
  {
    name: "propose_add_drop",
    description: "DRAFT a free-agent add/drop. Does NOT send it.",
    input_schema: { type: "object", properties: { ...leagueId, rosterId: { type: "number" }, addPlayerId: { type: "string" }, dropPlayerId: { type: "string" } }, required: ["leagueId", "rosterId", "addPlayerId"] },
  },
  {
    name: "propose_waiver_claim",
    description: "DRAFT a waiver claim (add/drop + FAAB). Does NOT send it.",
    input_schema: { type: "object", properties: { ...leagueId, rosterId: { type: "number" }, addPlayerId: { type: "string" }, dropPlayerId: { type: "string" }, faabBid: { type: "number" } }, required: ["leagueId", "rosterId", "addPlayerId"] },
  },
  {
    name: "execute_action",
    description: "SEND a previously-proposed action. Only call after the user has explicitly confirmed they want it sent.",
    input_schema: { type: "object", properties: { actionId: { type: "string" } }, required: ["actionId"] },
  },
  {
    name: "remember_fact",
    description:
      "Save a short, durable fact or preference to long-term MEMORY so it applies in every future chat (e.g. 'I'm rebuilding and value youth', 'I stream defenses', '12-team half-PPR dynasty'). Call this PROACTIVELY whenever the user reveals a lasting fact about themselves, their team, or their league — you do not need to be asked. Skip one-off questions, this week's matchup, and ephemeral state; don't duplicate what's already in MEMORY.",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "forget_fact",
    description: "Remove one MEMORY note by the [id] shown next to it in the MEMORY block. Use when the user asks you to forget something.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

/** Execute a Claude tool call against the shared operations. */
export async function dispatchTool(ops: SleepBotOperations, name: string, input: unknown): Promise<unknown> {
  const a = (input ?? {}) as Record<string, any>;
  switch (name) {
    case "list_leagues": return ops.listLeagues();
    case "get_league_info": return ops.getLeagueInfo(a.leagueId);
    case "get_rosters": return ops.getRosters(a.leagueId);
    case "get_my_roster": return ops.getMyRoster(a.leagueId);
    case "get_standings": return ops.getStandings(a.leagueId);
    case "get_matchups": return ops.getMatchups(a.leagueId, a.week);
    case "get_transactions": return ops.getTransactions(a.leagueId, a.week);
    case "search_players": return ops.searchPlayers(a.leagueId, a.query, { position: a.position, team: a.team, limit: a.limit });
    case "get_trending_players": return ops.getTrendingPlayers(a.leagueId, a.type ?? "add", a.limit);
    case "get_auth_status": return ops.getAuthStatus(a.leagueId);
    case "get_audit_log": return ops.getAuditLog(a.leagueId);
    case "get_drafts": return ops.listDrafts(a.leagueId);
    case "get_draft_board": return ops.getDraftBoard(a.leagueId, a.draftId, a.yourRosterId);
    case "get_draft_recommendations":
      return ops.getDraftRecommendations(a.leagueId, a.draftId, { rosterId: a.rosterId, position: a.position, limit: a.limit });
    case "list_pending_actions": return ops.listPendingActions(a.leagueId);
    case "propose_trade":
      return proposalOutcome(await ops.proposeTrade(a.leagueId, { fromRosterId: a.fromRosterId, toRosterId: a.toRosterId, sendPlayerIds: a.sendPlayerIds, receivePlayerIds: a.receivePlayerIds }));
    case "propose_add_drop":
      return proposalOutcome(await ops.proposeAddDrop(a.leagueId, { rosterId: a.rosterId, addPlayerId: a.addPlayerId, dropPlayerId: a.dropPlayerId }));
    case "propose_waiver_claim":
      return proposalOutcome(await ops.proposeWaiverClaim(a.leagueId, { rosterId: a.rosterId, addPlayerId: a.addPlayerId, dropPlayerId: a.dropPlayerId, faabBid: a.faabBid }));
    case "execute_action": return ops.executeAction(a.actionId);
    case "remember_fact": return ops.memory.add(a.text, "model");
    case "forget_fact": { await ops.memory.remove(a.id); return { ok: true, forgotten: a.id }; }
    default: throw new Error(`unknown tool: ${name}`);
  }
}
