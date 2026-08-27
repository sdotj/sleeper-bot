import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { guard, type ToolContext } from "./_shared.js";

/** `list_leagues` — configured leagues, straight from config (no API call). */
export function registerListLeagues(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_leagues",
    {
      title: "List configured leagues",
      description:
        "List the leagues configured in this SleepBot instance. Returns each league's " +
        "id label, platform, and platform-specific identifiers. Use the returned `id` " +
        "as the `leagueId` argument to every other tool. Reads config only — no network.",
      inputSchema: {},
    },
    guard(async () =>
      ctx.config.list().map((l) => ({
        id: l.id,
        platform: l.platform,
        sleeperLeagueId: l.sleeper?.leagueId,
        espnLeagueId: l.espn?.leagueId,
      })),
    ),
  );
}
