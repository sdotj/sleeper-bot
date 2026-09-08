import { readFile } from "node:fs/promises";
import { z } from "zod";

/**
 * Schema for `config/rules.json` — the user's guardrails on write actions
 * (dec.rules-engine-and-value). A rule can only ever restrict, or (via `mode:
 * auto`) pre-approve; it never widens what the user could do manually.
 */

/** A hard block: never trade away / drop the named player. */
export const protectRuleSchema = z
  .object({
    /** Match by platform player id (exact) ... */
    playerId: z.string().optional(),
    /** ... or by display name (case-insensitive), e.g. "Ja'Marr Chase". */
    playerName: z.string().optional(),
    /** Which movements are forbidden. Default: both. */
    actions: z.array(z.enum(["trade", "drop"])).default(["trade", "drop"]),
  })
  .refine((r) => r.playerId || r.playerName, {
    message: "a protect rule needs either playerId or playerName",
  });

/** A non-blocking flag on a lopsided trade. */
export const warnRuleSchema = z.object({
  type: z.literal("trade_value_diff"),
  /** Warn when |sent - received| / max exceeds this percentage. */
  thresholdPct: z.number().min(0).max(100),
});

export const rulesConfigSchema = z.object({
  /** manual = approve every action; auto = execute anything that passes blocks. */
  mode: z.enum(["manual", "auto"]).default("manual"),
  protect: z.array(protectRuleSchema).default([]),
  warn: z.array(warnRuleSchema).default([]),
});

export type ProtectRule = z.infer<typeof protectRuleSchema>;
export type WarnRule = z.infer<typeof warnRuleSchema>;
export type RulesConfig = z.infer<typeof rulesConfigSchema>;

/**
 * Load and validate rules config — the write guardrails. Precedence (audit #5):
 *
 *  1. `SLEEPBOT_RULES_JSON` — inline JSON, the cloud seed (parallels
 *     SLEEPBOT_CONFIG_JSON). Use this so a container ships with its guardrails.
 *  2. An explicit file path (the `path` arg or `SLEEPBOT_RULES`).
 *  3. The default `config/rules.json`.
 *
 * It fails CLOSED: only a genuinely-absent DEFAULT file (ENOENT) yields the safe
 * defaults (manual mode, no rules). An explicitly-configured path that can't be
 * read, a permission error, a directory in place of the file, invalid JSON, or a
 * schema violation all THROW — guardrails must never silently disappear, because
 * a per-league `auto` agent would then execute writes with no protection.
 */
export async function loadRulesConfig(path?: string): Promise<RulesConfig> {
  const inline = process.env.SLEEPBOT_RULES_JSON;
  if (inline?.trim()) return parseRulesConfig(inline, "SLEEPBOT_RULES_JSON");

  const explicit = path ?? process.env.SLEEPBOT_RULES;
  const target = explicit ?? "config/rules.json";
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (!explicit && code === "ENOENT") return rulesConfigSchema.parse({}); // no default file → safe defaults
    throw new Error(
      `could not read rules config at ${target} (${code ?? (err as Error).message}) — ` +
        (explicit
          ? "this path was set explicitly via SLEEPBOT_RULES. "
          : "the default rules file exists but is unreadable. ") +
        "Refusing to start with write guardrails silently disabled; fix the path or set SLEEPBOT_RULES_JSON.",
    );
  }
  return parseRulesConfig(raw, target);
}

/** Parse + schema-validate rules JSON from a named source; throws with detail. */
function parseRulesConfig(raw: string, source: string): RulesConfig {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`rules config at ${source} is not valid JSON: ${(err as Error).message}`);
  }
  const parsed = rulesConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`invalid rules config at ${source}:\n${issues}`);
  }
  return parsed.data;
}
