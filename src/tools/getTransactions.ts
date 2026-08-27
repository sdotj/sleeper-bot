import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_transactions` — trades, waivers, and free-agent moves for a week. */
export function registerGetTransactions(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_transactions",
    {
      title: "Get transactions",
      description:
        "Get a week's transactions: trades, waiver claims, and free-agent add/drops. " +
        "Each has its type, status, added/dropped player ids keyed to roster ids, and " +
        "FAAB bid for waivers. Omit `week` to use the current NFL week.",
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
      ctx.adapterFor(leagueId).getTransactions(week),
    ),
  );
}
