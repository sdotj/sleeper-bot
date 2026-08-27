import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConfigRegistry } from "../config/loader.js";
import { buildToolContext, type ToolContext } from "./_shared.js";
import { registerGetLeagueInfo } from "./getLeagueInfo.js";
import { registerGetMatchups } from "./getMatchups.js";
import { registerGetMyRoster } from "./getMyRoster.js";
import { registerGetRosters } from "./getRosters.js";
import { registerGetStandings } from "./getStandings.js";
import { registerGetTransactions } from "./getTransactions.js";
import { registerGetTrendingPlayers } from "./getTrendingPlayers.js";
import { registerListLeagues } from "./listLeagues.js";
import { registerSearchPlayers } from "./searchPlayers.js";
import { registerProposeTrade } from "./proposeTrade.js";
import { registerProposeWaiverClaim } from "./proposeWaiverClaim.js";
import { registerProposeAddDrop } from "./proposeAddDrop.js";
import { registerExecuteAction } from "./executeAction.js";
import { registerListPendingActions } from "./listPendingActions.js";
import { registerGetAuthStatus } from "./getAuthStatus.js";

/**
 * Build the tool context (loads config-driven deps) and register every tool
 * with the MCP server. This is the one place the server learns what tools
 * exist; index.ts stays free of tool detail.
 */
export async function registerAllTools(server: McpServer, config: ConfigRegistry): Promise<void> {
  const ctx: ToolContext = await buildToolContext(config);

  // Phase 1 — read-only
  registerListLeagues(server, ctx);
  registerGetLeagueInfo(server, ctx);
  registerGetRosters(server, ctx);
  registerGetMyRoster(server, ctx);
  registerGetMatchups(server, ctx);
  registerGetStandings(server, ctx);
  registerGetTransactions(server, ctx);
  registerSearchPlayers(server, ctx);
  registerGetTrendingPlayers(server, ctx);

  // Phase 2 — write actions (confirm-by-default)
  registerProposeTrade(server, ctx);
  registerProposeWaiverClaim(server, ctx);
  registerProposeAddDrop(server, ctx);
  registerExecuteAction(server, ctx);
  registerListPendingActions(server, ctx);
  registerGetAuthStatus(server, ctx);
}
