import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configSchema, type LeagueEntry, type SleepBotConfig } from "./schema.js";

/**
 * Loads and validates the leagues config, then exposes lookup by the user's
 * league label. Everything downstream resolves a leagueId label through this
 * registry, so no tool ever hardcodes a platform or a numeric league id.
 */
export class ConfigRegistry {
  private readonly byId: Map<string, LeagueEntry>;

  private constructor(public readonly config: SleepBotConfig) {
    this.byId = new Map(config.leagues.map((l) => [l.id, l]));
  }

  /**
   * Read `config/leagues.json` (override with the SLEEPBOT_CONFIG env var) and
   * validate it against the schema. Throws a readable error on invalid config.
   */
  static load(configPath?: string): ConfigRegistry {
    const path = resolve(
      configPath ?? process.env.SLEEPBOT_CONFIG ?? "config/leagues.json",
    );

    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      throw new Error(
        `could not read config at ${path}. Copy config/leagues.example.json to ` +
          `config/leagues.json and fill in your league, or set SLEEPBOT_CONFIG.`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`config at ${path} is not valid JSON: ${(err as Error).message}`);
    }

    const result = configSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`invalid config at ${path}:\n${issues}`);
    }

    return new ConfigRegistry(result.data);
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
