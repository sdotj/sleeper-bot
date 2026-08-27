import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, proposalOutcome, type ToolContext } from "./_shared.js";

/** `propose_add_drop` — draft a free-agent add/drop. Confirm-by-default: never sends. */
export function registerProposeAddDrop(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "propose_add_drop",
    {
      title: "Propose an add/drop",
      description:
        "Draft a free-agent add (optionally dropping a player to make room) and run it " +
        "through the rules engine. Returns a DRAFT with an actionId — it does NOT send " +
        "the move. Call execute_action with the actionId to send an allowed draft.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
        rosterId: z.number().int().describe("Your roster id."),
        addPlayerId: z.string().describe("Player id to add."),
        dropPlayerId: z.string().optional().describe("Player id to drop, if any."),
      },
    },
    guard(
      async (args: {
        leagueId: string;
        rosterId: number;
        addPlayerId: string;
        dropPlayerId?: string;
      }) => {
        const { leagueId, ...payload } = args;
        return proposalOutcome(await ctx.pipeline.propose(leagueId, "add_drop", payload));
      },
    ),
  );
}
