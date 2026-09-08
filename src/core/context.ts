import type { WriteableLeagueAdapter } from "../adapters/LeagueAdapter.js";
import { SleeperAdapter } from "../adapters/sleeper/SleeperAdapter.js";
import { SleeperClient } from "../adapters/sleeper/sleeperClient.js";
import { EspnAdapter } from "../adapters/espn/EspnAdapter.js";
import { EspnClient } from "../adapters/espn/espnClient.js";
import { SleeperSessionProvider, inspectToken, type SessionStatus } from "../auth/index.js";
import { AuditLog, createStore, type Store } from "../audit/index.js";
import { decryptSecret, encryptSecret, secretsEnabled } from "../crypto/index.js";
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
import { ChatHistory, MemoryStore } from "../history/index.js";
import { ConfigRegistry } from "../config/loader.js";
import { resolveEnvRef, type LeagueEntry } from "../config/schema.js";

/**
 * AppContext — the wired-up SleepBot core. Every front-end (the MCP server, the
 * HTTP api, the chat loop) is built on one of these, so they all share the same
 * adapters, pipeline, audit log, and config (dec.gui-architecture). Domain logic
 * lives in those collaborators; this is just the wiring hub.
 */
/** Status of the active Sleeper write token, plus where it came from (settings panel). */
export interface SleeperTokenStatus extends SessionStatus {
  /** "store" = set from the UI (encrypted in the DB); "env" = the SLEEPER_TOKEN seed; "none" = unset. */
  source: "store" | "env" | "none";
  /** False when SLEEPBOT_SECRET_KEY is unset — the token can't be saved from the UI. */
  editable: boolean;
}

export interface AppContext {
  config: ConfigRegistry;
  /** The write-capable adapter for a league (also serves reads), cached per league. */
  adapterFor(leagueId: string): WriteableLeagueAdapter;
  /** Player value for a league, per its configured mode (redraft vs dynasty). */
  valueFor(leagueId: string): ValueProvider;
  pipeline: ActionPipeline;
  audit: AuditLog;
  draft: DraftAssistant;
  /** Persistent chat conversations (main chat history). */
  chatHistory: ChatHistory;
  /** Long-term chat memory (durable facts injected into every chat). */
  memory: MemoryStore;
  /** The shared persistence store (audit, pending, agent outbox). */
  store: Store;

  // --- UI-editable config + secrets (dec.ui-config-editing) ----------------
  /** Re-read the leagues config from the store and rebuild per-league adapters. */
  reload(): Promise<void>;
  /**
   * If another process changed the config or Sleeper token (tracked by a store
   * version stamp), re-read both and rebuild adapters — so a second instance
   * behind a load balancer doesn't keep serving stale leagues or a dead token
   * (audit #14). A no-op when already current. Called on write/sweep paths.
   */
  refresh(): Promise<void>;
  /** Validate + persist a new leagues config, then adopt it live. Throws (persists nothing) on invalid input. */
  saveConfig(parsed: unknown): Promise<void>;
  /** Discard the stored config and reseed it from the env/file (`SLEEPBOT_CONFIG_JSON` / config file). */
  resetConfigToEnv(): Promise<void>;
  /** Whether secrets can be stored (SLEEPBOT_SECRET_KEY is set). */
  secretsEnabled(): boolean;
  /** Encrypt + store the Sleeper write token and apply it live (clears needs-reauth). */
  setSleeperToken(token: string): Promise<void>;
  /** Remove the stored token and revert to the env seed (if any). */
  clearSleeperToken(): Promise<void>;
  /** Status of the active Sleeper write token, for the settings panel. */
  sleeperTokenStatus(): SleeperTokenStatus;
}

/**
 * Build the core once at startup: load rules + optional rankings, wire the
 * shared JSON store (audit + pending), and cache one adapter per league so each
 * league's write session (and its needs-reauth state) persists across calls.
 */
export async function buildAppContext(config: ConfigRegistry, storeOverride?: Store): Promise<AppContext> {
  const store = storeOverride ?? (await createStore()); // Postgres when DATABASE_URL is set, else JSON file
  // Store-authoritative after first seed: adopt a stored config if present, else
  // seed the store from the env/file config we were handed (dec.ui-config-editing).
  await reconcileConfig(config, store);

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

  // One shared Sleeper write session for ALL leagues: the token is a single
  // account credential, so sharing it means a UI update (or a needs-reauth on a
  // failed write) applies everywhere at once.
  const resolved = await resolveSleeperToken(store);
  let tokenSource = resolved.source;
  const sleeperSession = new SleeperSessionProvider({ token: resolved.token });

  // Version stamp for cross-instance config/token invalidation (audit #14).
  // Every mutation bumps a monotonic stamp in the store; refresh() reloads when
  // the stored stamp is ahead of what this process last applied.
  let appliedVersion = (await store.get<{ version?: number }>("meta", "config_version"))?.version ?? 0;
  const bumpVersion = async (): Promise<void> => {
    appliedVersion = Math.max(appliedVersion + 1, Date.now());
    await store.put("meta", "config_version", { version: appliedVersion });
  };

  const adapters = new Map<string, WriteableLeagueAdapter>();
  const adapterFor = (leagueId: string): WriteableLeagueAdapter => {
    let adapter = adapters.get(leagueId);
    if (!adapter) {
      adapter = buildAdapter(config.get(leagueId), sleeperClient, sleeperSession);
      adapters.set(leagueId, adapter);
    }
    return adapter;
  };

  const pipeline = new ActionPipeline({ rules, audit, pending, valueFor, adapterFor });
  const draft = new DraftAssistant({ adapterFor, valueFor });
  const chatHistory = new ChatHistory(store);
  const memory = new MemoryStore(store);

  return {
    config,
    adapterFor,
    valueFor,
    pipeline,
    audit,
    draft,
    chatHistory,
    memory,
    store,

    async reload() {
      const stored = await store.get<unknown>("config", "current");
      if (stored != null) config.applyConfig(ConfigRegistry.validate(stored, "stored config"));
      adapters.clear(); // rebuild against the new config (they share sleeperSession)
    },

    async refresh() {
      const stored = (await store.get<{ version?: number }>("meta", "config_version"))?.version ?? 0;
      if (stored <= appliedVersion) return; // already current (or we're the writer)
      const cfg = await store.get<unknown>("config", "current");
      if (cfg != null) config.applyConfig(ConfigRegistry.validate(cfg, "stored config"));
      const tok = await resolveSleeperToken(store);
      sleeperSession.setToken(tok.token);
      tokenSource = tok.source;
      adapters.clear();
      appliedVersion = stored;
      console.error(`[context] refreshed config + token to version ${stored} (changed by another instance).`);
    },

    async saveConfig(parsed: unknown) {
      const validated = ConfigRegistry.validate(parsed, "submitted config");
      await store.put("config", "current", validated);
      config.applyConfig(validated);
      adapters.clear();
      await bumpVersion();
    },

    async resetConfigToEnv() {
      const seed = ConfigRegistry.load();
      await store.put("config", "current", seed.config);
      config.applyConfig(seed.config);
      adapters.clear();
      await bumpVersion();
    },

    secretsEnabled,

    async setSleeperToken(token: string) {
      if (!secretsEnabled()) {
        throw new Error(
          "SLEEPBOT_SECRET_KEY is not set — cannot store the Sleeper token. Set it (a 32-byte key) and redeploy to enable saving secrets from the UI.",
        );
      }
      const trimmed = token.trim();
      inspectToken(trimmed); // reject non-JWTs before we store anything
      await store.put("secrets", "sleeper_token", {
        ciphertext: encryptSecret(trimmed),
        updatedAt: new Date().toISOString(),
      });
      sleeperSession.setToken(trimmed); // applies live; clears needs-reauth
      tokenSource = "store";
      await bumpVersion();
      console.error("[secrets] Sleeper write token updated from the settings panel.");
    },

    async clearSleeperToken() {
      await store.delete("secrets", "sleeper_token");
      const env = envSleeperToken();
      sleeperSession.setToken(env);
      tokenSource = env ? "env" : "none";
      await bumpVersion();
      console.error("[secrets] stored Sleeper token cleared; reverted to the env token if present.");
    },

    sleeperTokenStatus(): SleeperTokenStatus {
      return { ...sleeperSession.status(), source: tokenSource, editable: secretsEnabled() };
    },
  };
}

/** The Sleeper token from the environment (the seed / fallback). */
function envSleeperToken(): string | undefined {
  return process.env.SLEEPER_TOKEN || process.env.SLEEPER_SESSION_TOKEN || undefined;
}

/**
 * Resolve the active Sleeper token: a value stored (encrypted) from the UI wins;
 * otherwise fall back to the env seed. A stored value that can't be decrypted
 * (e.g. SLEEPBOT_SECRET_KEY rotated/unset) falls back to env rather than crashing.
 */
async function resolveSleeperToken(
  store: Store,
): Promise<{ token: string | undefined; source: "store" | "env" | "none" }> {
  const rec = await store.get<{ ciphertext?: string }>("secrets", "sleeper_token");
  if (rec?.ciphertext && secretsEnabled()) {
    try {
      return { token: decryptSecret(rec.ciphertext), source: "store" };
    } catch {
      console.error("[secrets] stored Sleeper token could not be decrypted (key changed?) — using env token.");
    }
  }
  const env = envSleeperToken();
  return { token: env, source: env ? "env" : "none" };
}

/**
 * Reconcile the passed (env/file) config with the store. Store-authoritative
 * after the first seed: if `config/current` exists we adopt it; otherwise we
 * write the seed so the UI has something durable to edit (dec.ui-config-editing).
 */
async function reconcileConfig(config: ConfigRegistry, store: Store): Promise<void> {
  const stored = await store.get<unknown>("config", "current");
  if (stored != null) {
    config.applyConfig(ConfigRegistry.validate(stored, "stored config"));
  } else {
    await store.put("config", "current", config.config);
  }
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

/** The current NFL season year (Sep–Feb belongs to the year the season began). */
function defaultSeason(now = new Date()): string {
  const y = now.getFullYear();
  return String(now.getMonth() >= 2 ? y : y - 1); // Jan/Feb -> previous season year
}

/** Map a validated league entry to its write-capable adapter. New platforms slot in here. */
function buildAdapter(
  entry: LeagueEntry,
  sleeperClient: SleeperClient,
  session: SleeperSessionProvider,
): WriteableLeagueAdapter {
  switch (entry.platform) {
    case "sleeper": {
      // schema.superRefine guarantees `sleeper` is present for platform "sleeper".
      // The write session is SHARED across leagues (one account credential); with
      // no token it sits in needs-reauth, which only affects writes — reads never
      // touch it. The token itself is resolved in buildAppContext (store or env).
      return new SleeperAdapter(entry.sleeper!.leagueId, sleeperClient, entry.sleeper!.username, session);
    }
    case "espn": {
      // schema.superRefine guarantees `espn` is present for platform "espn".
      const e = entry.espn!;
      const swid = e.swid ? resolveEnvRef(e.swid) : undefined;
      const espnS2 = e.espnS2 ? resolveEnvRef(e.espnS2) : undefined;
      const season = e.season ?? defaultSeason();
      const espnClient = new EspnClient(e.leagueId, season, { swid, espnS2 });
      // Read-only for now; writes throw EspnUnsupportedError.
      return new EspnAdapter(e.leagueId, season, espnClient, swid);
    }
    default: {
      const exhaustive: never = entry.platform;
      throw new Error(`unsupported platform: ${String(exhaustive)}`);
    }
  }
}
