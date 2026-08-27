import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_standings` — ranked table by wins, then points for. */
export function registerGetStandings(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_standings",
    {
      title: "Get standings",
      description:
        "Get the league standings, ranked by wins then points-for. Each row has rank, " +
        "owner, W-L-T record, and points for/against.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
      },
    },
    guard(async ({ leagueId }: { leagueId: string }) =>
      ctx.adapterFor(leagueId).getStandings(),
    ),
  );
}
