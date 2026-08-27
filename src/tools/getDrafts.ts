import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_drafts` — drafts discoverable for a league (mock/real). */
export function registerGetDrafts(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_drafts",
    {
      title: "Get drafts",
      description:
        "List drafts for a league: draftId, status (pre_draft/drafting/complete), type, " +
        "season, rounds, teams. Use a draftId with get_draft_board / get_draft_recommendations. " +
        "For a mock draft not tied to the league, pass its draftId directly to those tools.",
      inputSchema: { leagueId: z.string().describe("Your league label from list_leagues.") },
    },
    guard(async ({ leagueId }: { leagueId: string }) => ctx.draft.listDrafts(leagueId)),
  );
}
