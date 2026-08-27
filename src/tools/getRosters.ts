import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_rosters` — every team's roster: starters, bench, IR, record. */
export function registerGetRosters(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_rosters",
    {
      title: "Get rosters",
      description:
        "Get all rosters in a league. Each roster has its owner name, starters, full " +
        "player list, reserve (IR) and taxi player ids, and win/loss/points record. " +
        "Player ids can be resolved to names via search_players.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
      },
    },
    guard(async ({ leagueId }: { leagueId: string }) =>
      ctx.adapterFor(leagueId).getRosters(),
    ),
  );
}
