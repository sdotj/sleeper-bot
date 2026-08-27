import type { LeagueAdapter } from "../adapters/LeagueAdapter.js";
import { SleeperAdapter } from "../adapters/sleeper/SleeperAdapter.js";
import type { ConfigRegistry } from "../config/loader.js";
import type { LeagueEntry } from "../config/schema.js";

/**
 * Context handed to every tool. Tools depend only on this — the config registry
 * plus a factory that turns a leagueId label into the right platform adapter.
 * That indirection is what makes "support another league/platform" a config
 * edit rather than a tool-code change.
 */
export interface ToolContext {
  config: ConfigRegistry;
  adapterFor(leagueId: string): LeagueAdapter;
}

/** Build a ToolContext around a loaded config, wiring the per-platform factory. */
export function makeToolContext(config: ConfigRegistry): ToolContext {
  return {
    config,
    adapterFor(leagueId: string): LeagueAdapter {
      const entry = config.get(leagueId);
      return buildAdapter(entry);
    },
  };
}

/** Map a validated league entry to its adapter. New platforms slot in here. */
function buildAdapter(entry: LeagueEntry): LeagueAdapter {
  switch (entry.platform) {
    case "sleeper":
      // schema.superRefine guarantees `sleeper` is present for platform "sleeper".
      return new SleeperAdapter(entry.sleeper!.leagueId);
    case "espn":
      throw new Error(
        `league "${entry.id}" uses platform "espn", which arrives in Phase 4. ` +
          `Phase 1 supports Sleeper only.`,
      );
    default: {
      const exhaustive: never = entry.platform;
      throw new Error(`unsupported platform: ${String(exhaustive)}`);
    }
  }
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
