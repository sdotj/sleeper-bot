import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `search_players` — look players up by name, filter by position/team. */
export function registerSearchPlayers(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "search_players",
    {
      title: "Search players",
      description:
        "Search NFL players by (partial) name, optionally filtered by position or team. " +
        "Returns playerId, name, position, team, and status. Use this to turn the " +
        "player_id strings on rosters and matchups into readable players.",
      inputSchema: {
        leagueId: z
          .string()
          .describe("Your league label from list_leagues (selects the platform)."),
        query: z.string().describe("Full or partial player name, e.g. 'mahomes'."),
        position: z
          .string()
          .optional()
          .describe("Filter by position, e.g. 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'."),
        team: z.string().optional().describe("Filter by NFL team abbreviation, e.g. 'KC'."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results (default 25)."),
      },
    },
    guard(
      async ({
        leagueId,
        query,
        position,
        team,
        limit,
      }: {
        leagueId: string;
        query: string;
        position?: string;
        team?: string;
        limit?: number;
      }) => ctx.adapterFor(leagueId).searchPlayers(query, { position, team, limit }),
    ),
  );
}
