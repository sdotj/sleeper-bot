import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_trending_players` — Sleeper's most-added or most-dropped players. */
export function registerGetTrendingPlayers(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_trending_players",
    {
      title: "Get trending players",
      description:
        "Get the players trending across Sleeper's user base — the most-added or " +
        "most-dropped over the recent window, with the net count. Useful for spotting " +
        "waiver-wire risers.",
      inputSchema: {
        leagueId: z
          .string()
          .describe("Your league label from list_leagues (selects the platform)."),
        type: z
          .enum(["add", "drop"])
          .describe("'add' for most-added, 'drop' for most-dropped."),
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
        type,
        limit,
      }: {
        leagueId: string;
        type: "add" | "drop";
        limit?: number;
      }) => ctx.adapterFor(leagueId).getTrendingPlayers(type, limit),
    ),
  );
}
