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
 * Load and validate rules config. A missing file is not an error — it yields
 * the safe defaults (manual mode, no rules). Override the path with
 * SLEEPBOT_RULES.
 */
export async function loadRulesConfig(path?: string): Promise<RulesConfig> {
  const target = path ?? process.env.SLEEPBOT_RULES ?? "config/rules.json";
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch {
    return rulesConfigSchema.parse({}); // defaults
  }
  const parsed = rulesConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`invalid rules config at ${target}:\n${issues}`);
  }
  return parsed.data;
}
