import type { WriteableLeagueAdapter } from "../adapters/LeagueAdapter.js";
import { SleeperAdapter } from "../adapters/sleeper/SleeperAdapter.js";
import { SleeperClient } from "../adapters/sleeper/sleeperClient.js";
import { SleeperSessionProvider } from "../auth/index.js";
import { AuditLog, JsonFileStore } from "../audit/index.js";
import { GenericValueProvider } from "../value/index.js";
import { RulesEngine, loadRulesConfig } from "../rules/index.js";
import { ActionPipeline, PendingStore, type ProposedAction } from "../actions/index.js";
import type { ConfigRegistry } from "../config/loader.js";
import type { LeagueEntry } from "../config/schema.js";

/**
 * Context handed to every tool: the config registry, a factory that returns the
 * (write-capable) adapter for a league, and the Phase-2 action pipeline. Read
 * tools use the adapter's read methods; write tools go through the pipeline.
 */
export interface ToolContext {
  config: ConfigRegistry;
  adapterFor(leagueId: string): WriteableLeagueAdapter;
  pipeline: ActionPipeline;
}

/**
 * Build the full tool context once at startup. Loads rules + optional rankings
 * from disk, wires the shared JSON store (audit + pending), and caches one
 * adapter per league so each league's write session (and its needs-reauth
 * state) persists across calls.
 */
export async function buildToolContext(config: ConfigRegistry): Promise<ToolContext> {
  const store = new JsonFileStore();
  const audit = new AuditLog(store);
  const pending = new PendingStore(store);
  const rules = new RulesEngine(await loadRulesConfig());
  const value = await GenericValueProvider.fromFile(
    process.env.SLEEPBOT_RANKINGS ?? "config/rankings.json",
  );

  const adapters = new Map<string, WriteableLeagueAdapter>();
  const adapterFor = (leagueId: string): WriteableLeagueAdapter => {
    let adapter = adapters.get(leagueId);
    if (!adapter) {
      adapter = buildAdapter(config.get(leagueId));
      adapters.set(leagueId, adapter);
    }
    return adapter;
  };

  const pipeline = new ActionPipeline({ rules, audit, pending, value, adapterFor });
  return { config, adapterFor, pipeline };
}

/** Map a validated league entry to its write-capable adapter. New platforms slot in here. */
function buildAdapter(entry: LeagueEntry): WriteableLeagueAdapter {
  switch (entry.platform) {
    case "sleeper": {
      // schema.superRefine guarantees `sleeper` is present for platform "sleeper".
      // A session is always attached; with no token it sits in needs-reauth,
      // which only affects writes — reads never touch it.
      const session = new SleeperSessionProvider({
        token: process.env.SLEEPER_SESSION_TOKEN,
        refreshToken: process.env.SLEEPER_REFRESH_TOKEN,
      });
      return new SleeperAdapter(entry.sleeper!.leagueId, new SleeperClient(), entry.sleeper!.username, session);
    }
    case "espn":
      throw new Error(
        `league "${entry.id}" uses platform "espn", which arrives in Phase 4. ` +
          `Phase 1/2 support Sleeper only.`,
      );
    default: {
      const exhaustive: never = entry.platform;
      throw new Error(`unsupported platform: ${String(exhaustive)}`);
    }
  }
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
