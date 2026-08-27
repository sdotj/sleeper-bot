import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, proposalOutcome, type ToolContext } from "./_shared.js";

/** `propose_waiver_claim` — draft a waiver claim. Confirm-by-default: never sends. */
export function registerProposeWaiverClaim(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "propose_waiver_claim",
    {
      title: "Propose a waiver claim",
      description:
        "Draft a waiver claim (add a player, optionally dropping one, with a FAAB bid) and " +
        "run it through the rules engine. Returns a DRAFT with an actionId — it does NOT " +
        "submit the claim. Call execute_action with the actionId to submit an allowed draft.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
        rosterId: z.number().int().describe("Your roster id."),
        addPlayerId: z.string().describe("Player id to claim."),
        dropPlayerId: z.string().optional().describe("Player id to drop, if any."),
        faabBid: z.number().int().min(0).optional().describe("FAAB bid amount, if applicable."),
      },
    },
    guard(
      async (args: {
        leagueId: string;
        rosterId: number;
        addPlayerId: string;
        dropPlayerId?: string;
        faabBid?: number;
      }) => {
        const { leagueId, ...payload } = args;
        return proposalOutcome(await ctx.pipeline.propose(leagueId, "waiver_claim", payload));
      },
    ),
  );
}
