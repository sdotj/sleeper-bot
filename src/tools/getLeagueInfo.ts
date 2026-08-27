import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_league_info` — settings, scoring, season, roster positions. */
export function registerGetLeagueInfo(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_league_info",
    {
      title: "Get league info",
      description:
        "Get a league's settings: name, season, status, scoring type and settings, " +
        "number of teams, and the ordered roster position slots.",
      inputSchema: {
        leagueId: z
          .string()
          .describe("Your league label from list_leagues (e.g. 'my-main-league')."),
      },
    },
    guard(async ({ leagueId }: { leagueId: string }) =>
      ctx.adapterFor(leagueId).getLeagueInfo(),
    ),
  );
}
