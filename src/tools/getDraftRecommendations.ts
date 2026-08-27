import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_draft_recommendations` — best available players by value + roster need. */
export function registerGetDraftRecommendations(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_draft_recommendations",
    {
      title: "Get draft recommendations",
      description:
        "Recommend the best available players in a draft, ranked by value (KTC) with the " +
        "already-drafted players excluded. Pass rosterId to weight the reasons toward your " +
        "positional needs, position to filter (QB/RB/WR/TE/K/DEF), and limit for how many.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
        draftId: z.string().describe("Draft id from get_drafts (or a mock draft's id)."),
        rosterId: z.number().int().optional().describe("Your roster id, to factor in needs."),
        position: z
          .string()
          .optional()
          .describe("Filter to one position: QB, RB, WR, TE, K, or DEF."),
        limit: z.number().int().min(1).max(50).optional().describe("How many to return (default 10)."),
      },
    },
    guard(
      async ({
        leagueId,
        draftId,
        rosterId,
        position,
        limit,
      }: {
        leagueId: string;
        draftId: string;
        rosterId?: number;
        position?: string;
        limit?: number;
      }) => ctx.draft.recommend(leagueId, draftId, { rosterId, position, limit })),
  );
}
