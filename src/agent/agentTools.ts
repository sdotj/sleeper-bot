import type Anthropic from "@anthropic-ai/sdk";
import type { WritePayload } from "../adapters/LeagueAdapter.js";
import type { SleepBotOperations } from "../core/index.js";
import type { ActionKind } from "../rules/index.js";

/**
 * The agent's Claude tools: league-scoped reads (leagueId is bound by the sweep,
 * so the model doesn't pass it), web search (added in the loop), and a single
 * `recommend_action` tool. The agent captures recommendations and routes them
 * itself through the pipeline — it deliberately does NOT get propose_/execute_
 * tools, so the model reasons but never drives writes (dec.autonomous-agent).
 */
export const AGENT_TOOLS: Anthropic.Tool[] = [
  { name: "get_my_roster", description: "The user's roster: starters, bench, IR, record.", input_schema: { type: "object", properties: {} } },
  { name: "get_rosters", description: "All rosters in the league (to spot trade partners / who holds whom).", input_schema: { type: "object", properties: {} } },
  { name: "get_standings", description: "League standings.", input_schema: { type: "object", properties: {} } },
  { name: "get_matchups", description: "This week's matchups and scores.", input_schema: { type: "object", properties: { week: { type: "number" } } } },
  { name: "get_transactions", description: "Recent trades/waivers/add-drops.", input_schema: { type: "object", properties: { week: { type: "number" } } } },
  { name: "get_trending_players", description: "Most-added / most-dropped players (waiver targets).", input_schema: { type: "object", properties: { type: { type: "string", enum: ["add", "drop"] }, limit: { type: "number" } } } },
  { name: "search_players", description: "Find players by name; resolve names <-> ids.", input_schema: { type: "object", properties: { query: { type: "string" }, position: { type: "string" }, team: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "get_league_info", description: "League settings, scoring, roster slots.", input_schema: { type: "object", properties: {} } },
  {
    name: "recommend_action",
    description:
      "Recommend ONE roster move for the user to consider. It is run through the rules engine and sent to the user for approval (never executed by you). Use for waiver claims, free-agent add/drops, and trade proposals. Player ids come from search_players / get_rosters. Call once per distinct move; recommend nothing if nothing clearly helps.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["waiver_claim", "add_drop", "trade"] },
        rationale: { type: "string", description: "1-2 sentences: why this helps." },
        rosterId: { type: "number", description: "Your roster id (add_drop / waiver_claim)." },
        addPlayerId: { type: "string" },
        dropPlayerId: { type: "string" },
        faabBid: { type: "number", description: "FAAB bid (waiver_claim)." },
        fromRosterId: { type: "number", description: "Your roster id (trade)." },
        toRosterId: { type: "number", description: "The other roster id (trade)." },
        sendPlayerIds: { type: "array", items: { type: "string" }, description: "Player ids you send (trade)." },
        receivePlayerIds: { type: "array", items: { type: "string" }, description: "Player ids you receive (trade)." },
      },
      required: ["kind", "rationale"],
    },
  },
];

export interface Recommendation {
  kind: ActionKind;
  rationale: string;
  payload: WritePayload;
}

/** Dispatch an agent tool call. Reads use the bound leagueId; recommend_action is captured. */
export async function dispatchAgentTool(
  ops: SleepBotOperations,
  leagueId: string,
  name: string,
  input: unknown,
  recs: Recommendation[],
): Promise<unknown> {
  const a = (input ?? {}) as Record<string, any>;
  switch (name) {
    case "get_my_roster": return ops.getMyRoster(leagueId);
    case "get_rosters": return ops.getRosters(leagueId);
    case "get_standings": return ops.getStandings(leagueId);
    case "get_matchups": return ops.getMatchups(leagueId, a.week);
    case "get_transactions": return ops.getTransactions(leagueId, a.week);
    case "get_trending_players": return ops.getTrendingPlayers(leagueId, a.type ?? "add", a.limit);
    case "search_players": return ops.searchPlayers(leagueId, a.query, { position: a.position, team: a.team, limit: a.limit });
    case "get_league_info": return ops.getLeagueInfo(leagueId);
    case "recommend_action": {
      const rec = toRecommendation(a);
      recs.push(rec);
      return { recorded: true, note: `${rec.kind} recommendation recorded (${recs.length} so far)` };
    }
    default:
      throw new Error(`unknown agent tool: ${name}`);
  }
}

function toRecommendation(a: Record<string, any>): Recommendation {
  const rationale = String(a.rationale ?? "");
  if (a.kind === "trade") {
    return {
      kind: "trade",
      rationale,
      payload: {
        fromRosterId: a.fromRosterId,
        toRosterId: a.toRosterId,
        sendPlayerIds: a.sendPlayerIds ?? [],
        receivePlayerIds: a.receivePlayerIds ?? [],
      },
    };
  }
  if (a.kind === "waiver_claim") {
    return {
      kind: "waiver_claim",
      rationale,
      payload: { rosterId: a.rosterId, addPlayerId: a.addPlayerId, dropPlayerId: a.dropPlayerId, faabBid: a.faabBid },
    };
  }
  return {
    kind: "add_drop",
    rationale,
    payload: { rosterId: a.rosterId, addPlayerId: a.addPlayerId, dropPlayerId: a.dropPlayerId },
  };
}
