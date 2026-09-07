import { z } from "zod";

/**
 * Zod schema for `config/leagues.json`.
 *
 * The `leagues[]` array exists from day one even with a single entry, so
 * multi-league and multi-platform support is purely additive: append another
 * object, never change a tool signature.
 *
 * Secrets are never stored inline. A field like ESPN's `swid` holds the string
 * `"env:ESPN_SWID"`, and {@link resolveEnvRef} swaps in the real value from the
 * environment at runtime. Phase 1 (Sleeper public API) needs no secrets at all.
 */

/** A value that is either a literal string or an `env:VAR_NAME` indirection. */
const envRef = z
  .string()
  .describe("A literal value, or 'env:VAR_NAME' resolved from the environment at runtime.");

const sleeperConfig = z.object({
  leagueId: z.string().min(1, "sleeper.leagueId is required"),
  /** Optional: used to resolve which roster is 'yours' in later phases. */
  username: z.string().optional(),
});

const espnConfig = z.object({
  leagueId: z.string().min(1, "espn.leagueId is required"),
  /** Cookies for a private league (omit for a public one). Support `env:VAR`. */
  swid: envRef.optional(),
  espnS2: envRef.optional(),
  /** NFL season year, e.g. "2025". Defaults to the current season. */
  season: z.string().optional(),
});

/**
 * Opt a league into the autonomous manager. Omit it and the agent ignores the
 * league entirely. `autonomy` defaults to the SAFE "manual" so the open-source
 * default never auto-executes; set "auto" to let clean (no-warning, unblocked)
 * actions execute without a Telegram tap (warned/blocked always wait).
 */
const agentConfig = z.object({
  enabled: z.boolean().default(true),
  autonomy: z.enum(["manual", "auto"]).default("manual"),
});

/**
 * One league entry. `platform` discriminates which platform block is required.
 * `id` is the user's own label (e.g. "my-main-league") and is what every tool
 * call passes — it is decoupled from the platform's numeric league id.
 */
export const leagueEntrySchema = z
  .object({
    id: z.string().min(1, "league id (your own label) is required"),
    platform: z.enum(["sleeper", "espn"]),
    sleeper: sleeperConfig.optional(),
    espn: espnConfig.optional(),
    /**
     * How to value players for this league: "redraft" (Sleeper season-long
     * ranks — the default; covers kickers, doesn't inflate rookies) or
     * "dynasty" (KeepTradeCut long-term values). Affects draft recommendations
     * and trade-fairness warnings.
     */
    valueMode: z.enum(["redraft", "dynasty"]).default("redraft"),
    /** Opt into the autonomous manager for this league (off unless present). */
    agent: agentConfig.optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.platform === "sleeper" && !entry.sleeper) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `league "${entry.id}" has platform "sleeper" but no "sleeper" config block`,
        path: ["sleeper"],
      });
    }
    if (entry.platform === "espn" && !entry.espn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `league "${entry.id}" has platform "espn" but no "espn" config block`,
        path: ["espn"],
      });
    }
  });

export const configSchema = z
  .object({
    leagues: z.array(leagueEntrySchema).min(1, "at least one league must be configured"),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const [i, league] of cfg.leagues.entries()) {
      if (seen.has(league.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate league id "${league.id}" — ids must be unique`,
          path: ["leagues", i, "id"],
        });
      }
      seen.add(league.id);
    }
  });

export type LeagueEntry = z.infer<typeof leagueEntrySchema>;
export type SleepBotConfig = z.infer<typeof configSchema>;

/**
 * Resolve an `env:VAR_NAME` reference to its environment value. A plain string
 * is returned unchanged. Throws if an `env:` reference points at an unset
 * variable, so misconfiguration fails loudly at load time rather than mid-call.
 */
export function resolveEnvRef(value: string): string {
  if (!value.startsWith("env:")) return value;
  const varName = value.slice("env:".length);
  const resolved = process.env[varName];
  if (resolved === undefined || resolved === "") {
    throw new Error(
      `config references "${value}" but environment variable ${varName} is not set`,
    );
  }
  return resolved;
}
