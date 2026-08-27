import type { WriteableLeagueAdapter } from "../adapters/LeagueAdapter.js";
import { SleeperAdapter } from "../adapters/sleeper/SleeperAdapter.js";
import { SleeperClient } from "../adapters/sleeper/sleeperClient.js";
import { SleeperSessionProvider } from "../auth/index.js";
import { AuditLog, JsonFileStore } from "../audit/index.js";
import { GenericValueProvider } from "../value/index.js";
import { RulesEngine, loadRulesConfig } from "../rules/index.js";
import { ActionPipeline, PendingStore } from "../actions/index.js";
import type { ConfigRegistry } from "../config/loader.js";
import type { LeagueEntry } from "../config/schema.js";

/**
 * AppContext — the wired-up SleepBot core. Every front-end (the MCP server, the
 * HTTP api, the chat loop) is built on one of these, so they all share the same
 * adapters, pipeline, audit log, and config (dec.gui-architecture). Domain logic
 * lives in those collaborators; this is just the wiring hub.
 */
export interface AppContext {
  config: ConfigRegistry;
  /** The write-capable adapter for a league (also serves reads), cached per league. */
  adapterFor(leagueId: string): WriteableLeagueAdapter;
  pipeline: ActionPipeline;
  audit: AuditLog;
}

/**
 * Build the core once at startup: load rules + optional rankings, wire the
 * shared JSON store (audit + pending), and cache one adapter per league so each
 * league's write session (and its needs-reauth state) persists across calls.
 */
export async function buildAppContext(config: ConfigRegistry): Promise<AppContext> {
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
  return { config, adapterFor, pipeline, audit };
}

/** Map a validated league entry to its write-capable adapter. New platforms slot in here. */
function buildAdapter(entry: LeagueEntry): WriteableLeagueAdapter {
  switch (entry.platform) {
    case "sleeper": {
      // schema.superRefine guarantees `sleeper` is present for platform "sleeper".
      // A session is always attached; with no token it sits in needs-reauth,
      // which only affects writes — reads never touch it. SLEEPER_TOKEN matches
      // the ecosystem convention; SLEEPER_SESSION_TOKEN is a legacy fallback.
      const session = new SleeperSessionProvider({
        token: process.env.SLEEPER_TOKEN ?? process.env.SLEEPER_SESSION_TOKEN,
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
