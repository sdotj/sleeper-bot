import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `get_auth_status` — write-session posture for a league (no network call). */
export function registerGetAuthStatus(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_auth_status",
    {
      title: "Get write-auth status",
      description:
        "Report whether SleepBot can perform WRITE actions for a league: 'ok' or " +
        "'needs-reauth', plus whose token is in use and when it expires. Reads never " +
        "need auth. If state is needs-reauth, capture a fresh token (DevTools → Network → " +
        "any sleeper.com graphql request → 'authorization' header) and set SLEEPER_TOKEN.",
      inputSchema: {
        leagueId: z.string().describe("Your league label from list_leagues."),
      },
    },
    guard(async ({ leagueId }: { leagueId: string }) => {
      const status = ctx.adapterFor(leagueId).writeAuthStatus();
      const note =
        status.state === "ok"
          ? "Writes are authorized."
          : "Writes are paused (needs-reauth). Reads still work. Set a fresh SLEEPER_TOKEN.";
      return { ...status, note };
    }),
  );
}
