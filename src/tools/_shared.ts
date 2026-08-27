import { buildAppContext, proposalOutcome, type AppContext } from "../core/index.js";
import type { ConfigRegistry } from "../config/loader.js";

/**
 * Tools run against the shared core {@link AppContext} — the same object the
 * HTTP api and chat loop use. The MCP tool files are thin: validate input, call
 * a context collaborator (adapter / pipeline / config), format the result.
 */
export type ToolContext = AppContext;

/** Build the tool context once at startup (delegates to the shared core). */
export function buildToolContext(config: ConfigRegistry): Promise<ToolContext> {
  return buildAppContext(config);
}

// proposalOutcome lives in core so the HTTP api shares it; re-exported here so
// the tool files can keep importing it from "./_shared.js".
export { proposalOutcome };

/** MCP tool result shape for a successful JSON payload. */
export function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Wrap a tool handler so any thrown error becomes an MCP error result the model
 * can read, instead of crashing the server. Keeps every tool's happy path clean.
 */
export function guard<Args>(handler: (args: Args) => Promise<unknown>) {
  return async (args: Args) => {
    try {
      return jsonResult(await handler(args));
    } catch (err) {
      return {
        isError: true as const,
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
      };
    }
  };
}
