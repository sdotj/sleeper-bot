import type { WriteableLeagueAdapter } from "../adapters/LeagueAdapter.js";
import { SleeperAdapter } from "../adapters/sleeper/SleeperAdapter.js";
import { SleeperClient } from "../adapters/sleeper/sleeperClient.js";
import { SleeperSessionProvider } from "../auth/index.js";
import { AuditLog, JsonFileStore } from "../audit/index.js";
import {
  GenericValueProvider,
  KtcValueProvider,
  loadKtcSnapshot,
  type KtcMode,
  type PlayerLite,
  type ValueProvider,
} from "../value/index.js";
import { RulesEngine, loadRulesConfig } from "../rules/index.js";
import { ActionPipeline, PendingStore } from "../actions/index.js";
import { DraftAssistant } from "../draft/index.js";
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
  draft: DraftAssistant;
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

  // One shared Sleeper client so the ~5MB players dump is cached across the
  // adapters and the KTC value bridge.
  const sleeperClient = new SleeperClient();
  const value = await buildValueProvider(sleeperClient);

  const adapters = new Map<string, WriteableLeagueAdapter>();
  const adapterFor = (leagueId: string): WriteableLeagueAdapter => {
    let adapter = adapters.get(leagueId);
    if (!adapter) {
      adapter = buildAdapter(config.get(leagueId), sleeperClient);
      adapters.set(leagueId, adapter);
    }
    return adapter;
  };

  const pipeline = new ActionPipeline({ rules, audit, pending, value, adapterFor });
  const draft = new DraftAssistant({ adapterFor, value });
  return { config, adapterFor, pipeline, audit, draft };
}

/**
 * Build the value provider: prefer KeepTradeCut values (bridged to Sleeper ids)
 * when a snapshot is present, else fall back to the generic file/neutral
 * provider (dec.rules-engine-and-value). Mode (superflex vs 1-QB) is
 * configurable via SLEEPBOT_KTC_MODE, defaulting to superflex.
 */
async function buildValueProvider(sleeperClient: SleeperClient): Promise<ValueProvider> {
  const paths = [
    process.env.SLEEPBOT_KTC ?? "config/ktc-values.json",
    "config/ktc-values.example.json",
  ];
  for (const path of paths) {
    const ktc = await loadKtcSnapshot(path).catch(() => null);
    if (ktc && ktc.length) {
      const loadPlayers = async (): Promise<PlayerLite[]> =>
        Object.values(await sleeperClient.getPlayers()).map((p) => ({
          playerId: p.player_id,
          name: p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" "),
          position: p.position ?? "",
        }));
      return new KtcValueProvider(ktc, loadPlayers, {
        mode: (process.env.SLEEPBOT_KTC_MODE as KtcMode) ?? "sf",
      });
    }
  }
  return GenericValueProvider.fromFile(process.env.SLEEPBOT_RANKINGS ?? "config/rankings.json");
}

/** Map a validated league entry to its write-capable adapter. New platforms slot in here. */
function buildAdapter(entry: LeagueEntry, sleeperClient: SleeperClient): WriteableLeagueAdapter {
  switch (entry.platform) {
    case "sleeper": {
      // schema.superRefine guarantees `sleeper` is present for platform "sleeper".
      // A session is always attached; with no token it sits in needs-reauth,
      // which only affects writes — reads never touch it. SLEEPER_TOKEN matches
      // the ecosystem convention; SLEEPER_SESSION_TOKEN is a legacy fallback.
      const session = new SleeperSessionProvider({
        token: process.env.SLEEPER_TOKEN ?? process.env.SLEEPER_SESSION_TOKEN,
      });
      return new SleeperAdapter(entry.sleeper!.leagueId, sleeperClient, entry.sleeper!.username, session);
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
