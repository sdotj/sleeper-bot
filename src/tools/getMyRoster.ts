import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_my_roster` — the configured user's own roster, resolved from username. */
export function registerGetMyRoster(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_my_roster",
    {
      title: "Get my roster",
      description:
        "Get the configured user's own roster for a league — starters, bench, and IR " +
        "with player names, plus their record. Identifies 'you' from the username in " +
        "config, so there's no need to ask which team is yours. Returns an error if no " +
        "username is configured for the league.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
      },
    },
    guard(async ({ leagueId }: { leagueId: string }) => {
      const roster = await ctx.adapterFor(leagueId).getMyRoster();
      if (!roster) {
        const entry = ctx.config.get(leagueId);
        throw new Error(
          entry.sleeper?.username
            ? `no roster in "${leagueId}" is owned by "${entry.sleeper.username}" — ` +
                `check the username in config.`
            : `league "${leagueId}" has no username configured, so "your" team is unknown. ` +
                `Add "username" to the league's config block.`,
        );
      }
      return roster;
    }),
  );
}
