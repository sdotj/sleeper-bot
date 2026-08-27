import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_matchups` — weekly matchups and scores. Defaults to current week. */
export function registerGetMatchups(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_matchups",
    {
      title: "Get matchups",
      description:
        "Get a week's matchups and scores. Rosters sharing a matchupId are playing each " +
        "other head-to-head. Omit `week` to use the current NFL week.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
        week: z
          .number()
          .int()
          .min(1)
          .max(22)
          .optional()
          .describe("NFL week (1-22). Defaults to the current week."),
      },
    },
    guard(async ({ leagueId, week }: { leagueId: string; week?: number }) =>
      ctx.adapterFor(leagueId).getMatchups(week),
    ),
  );
}
