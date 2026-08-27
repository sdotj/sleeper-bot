import { buildAppContext, type AppContext } from "../core/index.js";
import type { ProposedAction } from "../actions/index.js";
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

/**
 * Attach a plain-language `note` to a proposal so the model states clearly
 * whether it was blocked, or is a draft awaiting an explicit execute_action.
 */
export function proposalOutcome(action: ProposedAction) {
  if (action.status === "rejected") {
    return {
      ...action,
      note: `BLOCKED by a rule — nothing was stored or sent. ${action.verdict.blockedReasons.join("; ")}`,
    };
  }
  const warn = action.verdict.warnings.length
    ? ` Warnings: ${action.verdict.warnings.join("; ")}.`
    : "";
  return {
    ...action,
    note:
      `Proposed as a DRAFT — nothing has been sent. To send it, call ` +
      `execute_action with actionId "${action.id}".${warn}`,
  };
}

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
