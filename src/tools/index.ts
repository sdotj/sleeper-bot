import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConfigRegistry } from "../config/loader.js";
import { makeToolContext } from "./_shared.js";
import { registerGetLeagueInfo } from "./getLeagueInfo.js";
import { registerGetMatchups } from "./getMatchups.js";
import { registerGetRosters } from "./getRosters.js";
import { registerGetStandings } from "./getStandings.js";
import { registerGetTransactions } from "./getTransactions.js";
import { registerGetTrendingPlayers } from "./getTrendingPlayers.js";
import { registerListLeagues } from "./listLeagues.js";
import { registerSearchPlayers } from "./searchPlayers.js";

/**
 * Register every Phase 1 (read-only) tool with the MCP server. This is the one
 * place the server learns what tools exist; index.ts stays free of tool detail.
 */
export function registerAllTools(server: McpServer, config: ConfigRegistry): void {
  const ctx = makeToolContext(config);

  registerListLeagues(server, ctx);
  registerGetLeagueInfo(server, ctx);
  registerGetRosters(server, ctx);
  registerGetMatchups(server, ctx);
  registerGetStandings(server, ctx);
  registerGetTransactions(server, ctx);
  registerSearchPlayers(server, ctx);
  registerGetTrendingPlayers(server, ctx);
}
