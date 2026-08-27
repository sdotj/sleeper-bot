import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_draft_board` — live board: status, who's on the clock, recent picks. */
export function registerGetDraftBoard(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_draft_board",
    {
      title: "Get draft board",
      description:
        "Get a live draft snapshot: status, how many picks are in, who is on the clock " +
        "(pick number, round, slot, roster), and the most recent picks (newest first). " +
        "Pass yourRosterId to also get your next pick number. Poll this during a live draft.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
        draftId: z.string().describe("Draft id from get_drafts (or a mock draft's id)."),
        yourRosterId: z
          .number()
          .int()
          .optional()
          .describe("Your roster id, to compute your next pick number."),
      },
    },
    guard(
      async ({
        leagueId,
        draftId,
        yourRosterId,
      }: {
        leagueId: string;
        draftId: string;
        yourRosterId?: number;
      }) => ctx.draft.getBoard(leagueId, draftId, { yourRosterId })),
  );
}
