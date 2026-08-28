import type { WriteableLeagueAdapter } from "../adapters/LeagueAdapter.js";
import { SleeperAdapter } from "../adapters/sleeper/SleeperAdapter.js";
import { SleeperClient } from "../adapters/sleeper/sleeperClient.js";
import { SleeperSessionProvider } from "../auth/index.js";
import { AuditLog, JsonFileStore } from "../audit/index.js";
import {
  DstOverlayValueProvider,
  GenericValueProvider,
  KtcValueProvider,
  SleeperRankValueProvider,
  dstValueMap,
  loadDstRanks,
  loadKtcSnapshot,
  type KtcMode,
  type PlayerLite,
  type RankedPlayer,
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
  /** Player value for a league, per its configured mode (redraft vs dynasty). */
  valueFor(leagueId: string): ValueProvider;
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
  // adapters and both value bridges.
  const sleeperClient = new SleeperClient();
  // Defenses aren't ranked by KTC or Sleeper, so overlay a DST tier onto both
  // value modes (its player ids are team codes, which is how Sleeper keys DEF).
  const dst = await loadDstValueMap();
  const redraftValue = withDst(buildRedraftValue(sleeperClient), dst);
  const dynastyValue = withDst(await buildDynastyValue(sleeperClient), dst);
  // Per-league selection: a league's config `valueMode` decides which to use.
  const valueFor = (leagueId: string): ValueProvider =>
    config.get(leagueId).valueMode === "dynasty" ? dynastyValue : redraftValue;

  const adapters = new Map<string, WriteableLeagueAdapter>();
  const adapterFor = (leagueId: string): WriteableLeagueAdapter => {
    let adapter = adapters.get(leagueId);
    if (!adapter) {
      adapter = buildAdapter(config.get(leagueId), sleeperClient);
      adapters.set(leagueId, adapter);
    }
    return adapter;
  };

  const pipeline = new ActionPipeline({ rules, audit, pending, valueFor, adapterFor });
  const draft = new DraftAssistant({ adapterFor, valueFor });
  return { config, adapterFor, valueFor, pipeline, audit, draft };
}

/** Load the DST tier (team code -> value); empty map if no ranks file is present. */
async function loadDstValueMap(): Promise<Map<string, number>> {
  const ranks =
    (await loadDstRanks(process.env.SLEEPBOT_DST ?? "config/dst-ranks.json")) ??
    (await loadDstRanks("config/dst-ranks.example.json"));
  return ranks ? dstValueMap(ranks) : new Map();
}

/** Overlay DST values onto a base provider (no-op if the DST map is empty). */
function withDst(base: ValueProvider, dst: Map<string, number>): ValueProvider {
  return dst.size ? new DstOverlayValueProvider(base, dst) : base;
}

/** Redraft value from Sleeper's season-long ranks (covers K; doesn't inflate rookies). */
function buildRedraftValue(sleeperClient: SleeperClient): ValueProvider {
  const loadPlayers = async (): Promise<RankedPlayer[]> =>
    Object.values(await sleeperClient.getPlayers()).map((p) => ({
      playerId: p.player_id,
      position: p.position ?? "",
      searchRank: p.search_rank ?? null,
    }));
  return new SleeperRankValueProvider(loadPlayers);
}

/**
 * Dynasty value from KeepTradeCut (bridged to Sleeper ids) when a snapshot is
 * present, else the generic file/neutral fallback (dec.rules-engine-and-value).
 * KTC mode (superflex vs 1-QB) is set by SLEEPBOT_KTC_MODE, defaulting to superflex.
 */
async function buildDynastyValue(sleeperClient: SleeperClient): Promise<ValueProvider> {
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
