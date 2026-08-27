import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { guard, type ToolContext } from "./_shared.js";

/** `execute_action` — send a previously-proposed action after explicit confirmation. */
export function registerExecuteAction(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "execute_action",
    {
      title: "Execute a proposed action",
      description:
        "Send a previously-proposed pending action (by actionId from a propose_* tool or " +
        "list_pending_actions). This is the explicit confirmation step — it re-checks the " +
        "rules, then performs the write. Only call this when the user has confirmed they " +
        "want the action sent.",
      inputSchema: {
        actionId: z.string().describe("The actionId of a pending action to send."),
      },
    },
    guard(async ({ actionId }: { actionId: string }) => ctx.pipeline.execute(actionId, "user")),
  );
}
