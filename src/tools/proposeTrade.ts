import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, proposalOutcome, type ToolContext } from "./_shared.js";

/** `propose_trade` — draft a trade. Confirm-by-default: never sends. */
export function registerProposeTrade(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "propose_trade",
    {
      title: "Propose a trade",
      description:
        "Draft a trade between two rosters and run it through the rules engine. Returns " +
        "a DRAFT with an actionId and any rule verdict/warnings — it does NOT send the " +
        "trade. If a protect rule blocks it, it is rejected and not stored. To actually " +
        "send an allowed draft, call execute_action with its actionId.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
        fromRosterId: z.number().int().describe("Your roster id (the side giving sendPlayerIds)."),
        toRosterId: z.number().int().describe("The other roster id."),
        sendPlayerIds: z.array(z.string()).describe("Player ids you send away."),
        receivePlayerIds: z.array(z.string()).describe("Player ids you receive."),
      },
    },
    guard(
      async (args: {
        leagueId: string;
        fromRosterId: number;
        toRosterId: number;
        sendPlayerIds: string[];
        receivePlayerIds: string[];
      }) => {
        const { leagueId, ...payload } = args;
        return proposalOutcome(await ctx.pipeline.propose(leagueId, "trade", payload));
      },
    ),
  );
}
