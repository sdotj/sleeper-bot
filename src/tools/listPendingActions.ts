import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `list_pending_actions` — proposed actions awaiting confirmation. */
export function registerListPendingActions(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_pending_actions",
    {
      title: "List pending actions",
      description:
        "List proposed actions that are still awaiting confirmation (drafts not yet sent), " +
        "newest first. Optionally filter to one league. Each includes its actionId for " +
        "use with execute_action.",
      inputSchema: {
        leagueId: z.string().optional().describe("Optional league label to filter by."),
      },
    },
    guard(async ({ leagueId }: { leagueId?: string }) => ctx.pipeline.listPending(leagueId)),
  );
}
