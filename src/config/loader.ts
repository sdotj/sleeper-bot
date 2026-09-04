import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configSchema, type LeagueEntry, type SleepBotConfig } from "./schema.js";

/**
 * Loads and validates the leagues config, then exposes lookup by the user's
 * league label. Everything downstream resolves a leagueId label through this
 * registry, so no tool ever hardcodes a platform or a numeric league id.
 */
export class ConfigRegistry {
  private _config!: SleepBotConfig;
  private byId!: Map<string, LeagueEntry>;

  private constructor(config: SleepBotConfig) {
    this.applyConfig(config);
  }

  /** The current validated config (mutable via {@link applyConfig} for live edits). */
  get config(): SleepBotConfig {
    return this._config;
  }

  /**
   * Adopt a new validated config in place. Every holder of this registry (the
   * adapters, the agent, the value selection) reads through `get`/`list`/`config`,
   * so swapping the internals here makes a UI edit take effect without a restart
   * (dec.ui-config-editing). The store I/O around this lives in the core context.
   */
  applyConfig(config: SleepBotConfig): void {
    this._config = config;
    this.byId = new Map(config.leagues.map((l) => [l.id, l]));
  }

  /** Validate an arbitrary object as a leagues config, throwing a readable error. */
  static validate(parsed: unknown, source = "input"): SleepBotConfig {
    const result = configSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`invalid config from ${source}:\n${issues}`);
    }
    return result.data;
  }

  /**
   * Load the leagues config. In the cloud, set SLEEPBOT_CONFIG_JSON to the config
   * JSON inline (a secret/env var) — no file needed. Otherwise read
   * `config/leagues.json` (override the path with SLEEPBOT_CONFIG). Throws a
   * readable error on invalid config.
   */
  static load(configPath?: string): ConfigRegistry {
    let raw: string;
    let source: string;

    const inline = process.env.SLEEPBOT_CONFIG_JSON;
    if (inline) {
      raw = inline;
      source = "SLEEPBOT_CONFIG_JSON";
    } else {
      const path = resolve(configPath ?? process.env.SLEEPBOT_CONFIG ?? "config/leagues.json");
      source = path;
      try {
        raw = readFileSync(path, "utf8");
      } catch {
        throw new Error(
          `could not read config at ${path}. Copy config/leagues.example.json to ` +
            `config/leagues.json and fill in your league, or set SLEEPBOT_CONFIG / ` +
            `SLEEPBOT_CONFIG_JSON (inline JSON, for cloud).`,
        );
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`config from ${source} is not valid JSON: ${(err as Error).message}`);
    }

    return new ConfigRegistry(ConfigRegistry.validate(parsed, source));
  }

  /** All configured leagues (used by the `list_leagues` tool). */
  list(): LeagueEntry[] {
    return this.config.leagues;
  }

  /** Look up a league by its label, or throw a helpful error listing valid ids. */
  get(leagueId: string): LeagueEntry {
    const entry = this.byId.get(leagueId);
    if (!entry) {
      const known = this.list().map((l) => l.id).join(", ") || "(none configured)";
      throw new Error(`unknown leagueId "${leagueId}". Configured leagues: ${known}`);
    }
    return entry;
  }
}
